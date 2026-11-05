import type { VideoProject } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { normalizeText, type QualityCheck } from "@/lib/blog/html";
import { generateStructured } from "@/lib/blog/openai";
import {
  BROCHURE_VERBS,
  CLIP_SECONDS,
  SCENE_COUNT,
  SCENE_WORDS_MAX,
  SCRIPT_WORDS_MAX,
  SCRIPT_WORDS_MIN,
  VIDEO_CTA,
  VIDEO_FORMATS,
  VIDEO_FORMAT_IDS,
  getBrandContext,
  type VideoChannel,
  type VideoFormat,
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

// The product is named, never credited with an effect.
const PRODUCT_EFFECT = /\b(ayuda|ayudan|ayudar|ayudarte|mejora|mejoran|mejorar|regula|equilibra|equilibrar|regulariza|reduce|reducir|aumenta|aumentar|hace que|te da|te dara|te devuelve)\b/;

// No medical claims anywhere in the script ("se trata de" is ordinary speech,
// so only "trata/tratar + object" counts).
const MEDICAL_CLAIM = /\b(cura|curar|regulariza|regularizar|previene|prevenir|elimina|eliminar|tratar? (el|la|los|las|tu|tus))\b/;

// No results promised in a time frame ("en 8 semanas vas a ver"). A time
// reference alone is fine — rule 2 asks for time data ("la semana antes de que
// te baje") — so it only counts next to a result promise in the same sentence.
const TIME_FRAME = /\b(en|a las|despues de) (\d+|un|una|dos|tres|cuatro|seis|ocho|doce) (dia|dias|semana|semanas|mes|meses)\b/;
const RESULT_PROMISE = /\b(vas a ver|veras|vas a notar|notaras|resultados|cambios|funciona|funcionara)\b/;

function timePromise(texts: string[]): string | null {
  for (const sentence of texts.join(". ").split(/[.?!]+/)) {
    const normalized = normalizeText(sentence);
    if (TIME_FRAME.test(normalized) && RESULT_PROMISE.test(normalized)) return sentence.trim();
  }
  return null;
}

const BROCHURE = new RegExp(`\\b(${BROCHURE_VERBS.join("|")})\\b`);

// Second-person talk about the condition gets paid ads rejected (section 11).
const PAID_SECOND_PERSON = /\b(tienes|tu|tú|te)\b[^.?!]{0,40}\b(sop|somp|ovario|acne|acné|hormonas?|periodo|regla|ciclo)\b/i;

/**
 * Timings come from the template, not the model: 0-5, 5-10, ... 20-25. The
 * spoken text of each scene is joined from its lines, and a format the
 * reviewer chose wins over whatever the model reports.
 */
export function normalizeScript(script: VideoScript, requiredFormat?: VideoFormat): VideoScript {
  const format =
    requiredFormat ?? (VIDEO_FORMAT_IDS.includes(script.format) ? script.format : "hac");
  return {
    ...script,
    format,
    onScreenComment: format === "reaccion" ? (script.onScreenComment ?? "").trim() : "",
    hashtags: script.hashtags.map((tag) => `#${tag.replace(/^#+/, "").replace(/\s+/g, "")}`),
    scenes: script.scenes.slice(0, SCENE_COUNT).map((scene, index) => {
      const lines = (scene.lines ?? []).map((line) => ({
        speaker: line.speaker.trim(),
        text: line.text.trim(),
        direction: line.direction.trim().replace(/^\[|\]$/g, ""),
      }));
      return {
        ...scene,
        lines,
        voiceover: lines.length ? lines.map((line) => line.text).join(" ") : scene.voiceover ?? "",
        startSecond: index * CLIP_SECONDS,
        endSecond: (index + 1) * CLIP_SECONDS,
      };
    }),
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
    .filter((scene) => scene.count > SCENE_WORDS_MAX);
  const totalWords = scenes.reduce((sum, scene) => sum + words(scene.voiceover), 0);
  const voice = scenes.map((scene) => normalizeText(`${scene.voiceover} ${scene.onScreenText}`));
  // In a reaction the comment on screen is the hook, so her first words are body.
  const bodyScenes = scenes.filter(
    (scene, index) => scene.section === "contexto" || (script.format === "reaccion" && index === 0)
  );
  const body = bodyScenes.map((scene) => normalizeText(scene.voiceover)).join(" ");
  const inBody = (line: string) => Boolean(normalizeText(line)) && body.includes(normalizeText(line));
  const brochureHits = voice
    .map((text, index) => ({ index, match: text.match(BROCHURE)?.[1] }))
    .filter((hit) => hit.match);
  const productScenes = scenes
    .map((scene, index) => ({ index, text: normalizeText(scene.voiceover) }))
    .filter(({ index }) => index >= Math.max(landingIndex, 0) && landingIndex !== -1);
  const effectHits = productScenes.filter(({ text }) => PRODUCT_EFFECT.test(text));
  const promise = timePromise([
    script.caption,
    script.cta,
    ...scenes.flatMap((scene) => [scene.voiceover, scene.onScreenText]),
  ]);
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
      id: "words",
      label: `${SCRIPT_WORDS_MIN}-${SCRIPT_WORDS_MAX} palabras de voz en total`,
      ok: totalWords >= SCRIPT_WORDS_MIN && totalWords <= SCRIPT_WORDS_MAX,
      detail: `${totalWords} palabras`,
      hard: totalWords < SCRIPT_WORDS_MIN - 15,
    },
    {
      id: "pace",
      label: `Máximo ${SCENE_WORDS_MAX} palabras por escena`,
      ok: longScenes.length === 0,
      detail: longScenes.length
        ? longScenes.map((scene) => `escena ${scene.index + 1}: ${scene.count}`).join(", ")
        : undefined,
    },
    {
      id: "brochure",
      label: "Sin verbos de folleto (requiere, produce, actúa, apoya…)",
      ok: brochureHits.length === 0,
      detail: brochureHits.length
        ? brochureHits.map((hit) => `escena ${hit.index + 1}: «${hit.match}»`).join(", ")
        : undefined,
      hard: brochureHits.length > 0,
    },
    {
      id: "insight",
      label: "El cuerpo dice algo que ella no sabía",
      ok: inBody(script.newInsight),
      detail: script.newInsight ? undefined : "falta el dato nuevo",
      hard: !inBody(script.newInsight),
    },
    {
      id: "felt",
      label: "Nombra lo que ella sintió",
      ok: inBody(script.feltLine),
      detail: script.feltLine ? undefined : "falta la emoción",
      hard: !inBody(script.feltLine),
    },
    {
      id: "productEffect",
      label: "El producto solo se nombra, sin atribuirle efectos",
      ok: effectHits.length === 0,
      detail: effectHits.length ? `escena ${effectHits.map((hit) => hit.index + 1).join(", ")}` : undefined,
      hard: effectHits.length > 0,
    },
    {
      id: "claims",
      label: "Sin claims médicos ni plazos de resultados",
      ok: !MEDICAL_CLAIM.test(fullText) && !promise,
      detail: [fullText.match(MEDICAL_CLAIM)?.[0], promise].filter(Boolean).join("; ") || undefined,
      hard: MEDICAL_CLAIM.test(fullText) || Boolean(promise),
    },
    {
      id: "forbidden",
      label: "Sin frases prohibidas por la marca",
      ok: forbidden.length === 0,
      detail: forbidden.map((item) => item.why).join("; ") || undefined,
      hard: forbidden.length > 0,
    },
  ];

  checks.push(...runFormatChecks(script));

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

/** Checks that the script is actually staged in its format. */
export function runFormatChecks(script: VideoScript): QualityCheck[] {
  const spec = VIDEO_FORMATS[script.format];
  const allLines = script.scenes.flatMap((scene) => scene.lines ?? []);
  const speakers = new Set(allLines.map((line) => normalizeText(line.speaker)).filter(Boolean));
  const speakerOf = (sentence: string) => {
    const target = normalizeText(sentence);
    return allLines.find((line) => target && normalizeText(line.text).includes(target))?.speaker;
  };
  const checks: QualityCheck[] = [
    {
      id: "formatReason",
      label: `Formato ${spec.label} justificado`,
      ok: Boolean(script.formatReason?.trim()),
      detail: script.formatReason?.trim() || "falta la razón",
    },
  ];

  if (spec.dialogue) {
    const firstLine = script.scenes[0]?.lines?.[0];
    const insightBy = speakerOf(script.newInsight);
    const feltBy = speakerOf(script.feltLine);
    checks.push(
      {
        id: "dialogue",
        label: "Diálogo con al menos dos personajes",
        ok: speakers.size >= 2,
        detail: `${speakers.size} personaje(s)`,
        hard: speakers.size < 2,
      },
      {
        id: "dialogueHook",
        label: "El gancho es la primera línea de diálogo",
        ok: Boolean(firstLine) && normalizeText(firstLine!.text).includes(normalizeText(script.hook).slice(0, 40)),
      },
      {
        id: "dialogueRoles",
        label: "El dato lo dice quien sabe y la emoción quien no sabe",
        ok: Boolean(insightBy && feltBy && normalizeText(insightBy) !== normalizeText(feltBy)),
        detail: insightBy && feltBy ? `dato: ${insightBy} · emoción: ${feltBy}` : undefined,
      }
    );
  } else {
    checks.push({
      id: "singleVoice",
      label: "Una sola voz",
      ok: speakers.size <= 1,
      detail: speakers.size > 1 ? [...speakers].join(", ") : undefined,
    });
  }

  if (script.format === "reaccion") {
    checks.push({
      id: "comment",
      label: "Comentario de su audiencia en pantalla como gancho",
      ok: Boolean(script.onScreenComment),
      hard: !script.onScreenComment,
    });
  }
  if (script.format === "dinamico") {
    const withText = script.scenes.filter((scene) => scene.onScreenText.trim()).length;
    checks.push({
      id: "onScreen",
      label: "Texto en pantalla en la mayoría de escenas",
      ok: withText >= 3,
      detail: `${withText} de ${script.scenes.length}`,
    });
  }
  return checks;
}

/** Writes (or rewrites, with the stored feedback) the script of a project. */
export async function generateVideoScript(projectId: string): Promise<VideoProject> {
  const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
  const product = project.product as VideoProduct;
  const channel = project.channel as VideoChannel;
  const requiredFormat = project.format && project.format !== "auto" ? (project.format as VideoFormat) : undefined;
  const previous = project.script as VideoScript | null;

  try {
    const instructions = buildScriptInstructions(getBrandContext());
    const brief = {
      idea: project.idea,
      product,
      channel,
      format: (project.format as VideoFormat | "auto" | null) ?? "auto",
      hookMold: project.hookMold,
    };
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
      const script = normalizeScript(generated.value, requiredFormat);
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
