import type { VideoProject } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { normalizeText, type QualityCheck } from "@/lib/blog/html";
import { generateStructured } from "@/lib/blog/openai";
import {
  CLIP_SECONDS,
  SCENE_COUNT,
  VIDEO_CTA,
  getBrandContext,
  type VideoChannel,
  type VideoProduct,
} from "@/lib/video/config";
import {
  SCRIPT_SCHEMA,
  buildScriptInput,
  buildScriptInstructions,
  type VideoScript,
} from "@/lib/video/prompt";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MAX_WORDS_PER_SCENE = Math.round(CLIP_SECONDS * 2.6);

// Terms the method keeps out of the first 3 seconds: brand and technical
// vocabulary (method sections 4 and 5).
const HOOK_FORBIDDEN = [
  "peach perfect",
  "myo",
  "d chiro",
  "80 1",
  "monohidratada",
  " mg",
  "bcaa",
  "colageno",
  "dim ",
];

// Anything the brand doc forbids outright, anywhere in the script.
const SCRIPT_FORBIDDEN: Array<{ term: string; why: string }> = [
  { term: "sigueme", why: "CTA prohibido «sígueme para más»" },
  { term: "capsula", why: "el inositol no tiene cápsulas" },
  { term: "40 1", why: "la proporción es 80:1, nunca 40:1" },
  { term: "antes y despues", why: "nada de antes/después" },
];

// Second-person talk about the condition gets paid ads rejected (section 11).
const PAID_SECOND_PERSON = /\b(tienes|tu|tú|te)\b[^.?!]{0,40}\b(sop|somp|ovario|acne|acné|hormonas?|periodo|regla|ciclo)\b/i;

/** Timings come from the template, not the model: 0-5, 5-10, ... 20-25. */
export function normalizeScript(script: VideoScript): VideoScript {
  return {
    ...script,
    hashtags: script.hashtags.map((tag) => `#${tag.replace(/^#+/, "").replace(/\s+/g, "")}`),
    scenes: script.scenes.slice(0, SCENE_COUNT).map((scene, index) => ({
      ...scene,
      startSecond: index * CLIP_SECONDS,
      endSecond: (index + 1) * CLIP_SECONDS,
    })),
  };
}

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function runScriptChecks(
  script: VideoScript,
  product: VideoProduct,
  channel: VideoChannel
): QualityCheck[] {
  const scenes = script.scenes;
  const first = scenes[0];
  const last = scenes[scenes.length - 1];
  const landingIndex = scenes.findIndex((scene) => scene.section === "aterrizaje");
  const hookText = ` ${normalizeText(`${script.hook} ${first?.voiceover ?? ""} ${first?.onScreenText ?? ""}`)} `;
  const fullText = normalizeText(
    [
      script.hook,
      script.cta,
      script.caption,
      ...scenes.flatMap((scene) => [scene.voiceover, scene.onScreenText]),
    ].join(" ")
  );
  const cta = VIDEO_CTA[product];
  const longScenes = scenes
    .map((scene, index) => ({ index, count: words(scene.voiceover) }))
    .filter((scene) => scene.count > MAX_WORDS_PER_SCENE);
  const forbidden = SCRIPT_FORBIDDEN.filter(({ term }) => fullText.includes(term));
  const earlyProduct = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene, index }) => scene.productVisible && (landingIndex === -1 || index < landingIndex));

  const checks: QualityCheck[] = [
    {
      id: "scenes",
      label: `${SCENE_COUNT} escenas de ${CLIP_SECONDS} s (${SCENE_COUNT * CLIP_SECONDS} s)`,
      ok: scenes.length === SCENE_COUNT,
      detail: `${scenes.length} escenas`,
      hard: scenes.length !== SCENE_COUNT,
    },
    {
      id: "structure",
      label: "Abre con gancho y cierra con CTA",
      ok: first?.section === "gancho" && last?.section === "cierre" && landingIndex > 0,
      hard: first?.section !== "gancho" || last?.section !== "cierre",
    },
    {
      id: "hook",
      label: "Gancho sin marca, producto técnico ni tecnicismos",
      ok: !HOOK_FORBIDDEN.some((term) => hookText.includes(term)),
      hard: hookText.includes("peach perfect"),
    },
    {
      id: "product",
      label: "El bote no aparece antes del aterrizaje",
      ok: earlyProduct.length === 0,
      detail: earlyProduct.length ? `escena ${earlyProduct.map((e) => e.index + 1).join(", ")}` : undefined,
      hard: earlyProduct.length > 0,
    },
    {
      id: "cta",
      label: `Cierre con el CTA fijo (${cta.keyword})`,
      ok: normalizeText(`${last?.voiceover ?? ""} ${script.cta}`).includes(normalizeText(cta.keyword)),
      hard: true,
    },
    {
      id: "pace",
      label: `Máximo ${MAX_WORDS_PER_SCENE} palabras de voz por escena`,
      ok: longScenes.length === 0,
      detail: longScenes.length
        ? longScenes.map((scene) => `escena ${scene.index + 1}: ${scene.count}`).join(", ")
        : undefined,
    },
    {
      id: "forbidden",
      label: "Sin frases prohibidas por la marca",
      ok: forbidden.length === 0,
      detail: forbidden.map((item) => item.why).join("; ") || undefined,
      hard: forbidden.length > 0,
    },
  ];

  if (channel === "pagado") {
    const hits = scenes
      .map((scene, index) => ({ index, text: `${scene.voiceover} ${scene.onScreenText}` }))
      .filter((scene) => PAID_SECOND_PERSON.test(scene.text));
    checks.push({
      id: "paid",
      label: "Anuncio: sin segunda persona sobre la condición",
      ok: hits.length === 0,
      detail: hits.length ? `revisar escena ${hits.map((h) => h.index + 1).join(", ")}` : undefined,
    });
  }
  return checks;
}

/** Writes (or rewrites, with the stored feedback) the script of a project. */
export async function generateVideoScript(projectId: string): Promise<VideoProject> {
  const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
  const product = project.product as VideoProduct;
  const channel = project.channel as VideoChannel;
  const previous = project.script as VideoScript | null;

  try {
    const instructions = buildScriptInstructions(getBrandContext());
    const brief = { idea: project.idea, product, channel, hookMold: project.hookMold };
    let feedback = project.feedback && previous ? project.feedback : undefined;
    let result: { script: VideoScript; checks: QualityCheck[]; model: string } | null = null;

    // One automatic retry when a hard check fails; the second result is kept
    // either way so the reviewer sees what is wrong.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const generated: { value: VideoScript; model: string } = await generateStructured<VideoScript>({
        name: "video_script",
        schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
        instructions,
        input: buildScriptInput(
          brief,
          feedback && (previous || result) ? { previous: result?.script ?? previous!, feedback } : undefined
        ),
      });
      const script = normalizeScript(generated.value);
      const checks = runScriptChecks(script, product, channel);
      result = { script, checks, model: generated.model };
      const failedHard = checks.filter((check) => check.hard && !check.ok);
      if (failedHard.length === 0) break;
      feedback = failedHard
        .map((check) => `${check.label}${check.detail ? ` (${check.detail})` : ""}`)
        .join("; ");
    }

    return await prisma.videoProject.update({
      where: { id: project.id },
      data: {
        status: "SCRIPT_READY",
        script: result!.script as unknown as object,
        checks: result!.checks as unknown as object,
        model: result!.model,
        feedback: null,
        error: null,
        revision: { increment: 1 },
      },
    });
  } catch (error) {
    return prisma.videoProject.update({
      where: { id: project.id },
      data: {
        // A failed revision keeps the previous script reviewable.
        status: previous ? "SCRIPT_READY" : "FAILED",
        error: errorMessage(error).slice(0, 2000),
      },
    });
  }
}
