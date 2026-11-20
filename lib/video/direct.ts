import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { del } from "@vercel/blob";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { generateImage, generateStructured, generateWithReferences } from "@/lib/blog/openai";
import { DEFAULT_VIDEO_TEXT_MODEL, FRAME_SIZE, videoImageModel } from "@/lib/video/constants";
import { generateClipVideo } from "@/lib/video/gateway-video";
import { prepareRender, renderVideo } from "@/lib/video/render";

// Direct videos (/videos/directo): a script and a context written by hand.
// The pipeline runs by itself in the worker: plan (split the script into
// segments of up to 15 s, the model's limit, and describe the first frame) →
// first-frame image → one clip per segment, each starting on the previous
// clip's last frame so the take looks continuous → the joined final video.

export const DIRECT_PRODUCTS = ["creatina", "inositol", "ninguno"] as const;
export type DirectProduct = (typeof DIRECT_PRODUCTS)[number];
export const DIRECT_DURATION = { min: 5, max: 60, default: 30 } as const;
export const MAX_SEGMENT_SECONDS = 15;

export interface DirectSegment {
  seconds: number;
  script: string;
}

export interface DirectPlan {
  firstFramePrompt: string;
  productVisible: boolean;
  segments: DirectSegment[];
  /** Reel caption and hashtags, written by /api/videos/[id]/caption. */
  caption?: string;
  hashtags?: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Splits the total into the fewest segments of at most 15 s, as even as possible. */
export function splitDuration(total: number): number[] {
  const count = Math.max(1, Math.ceil(total / MAX_SEGMENT_SECONDS));
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

const PLAN_SCHEMA = (count: number) => ({
  type: "object",
  additionalProperties: false,
  required: ["firstFramePrompt", "productVisible", "segments"],
  properties: {
    firstFramePrompt: {
      type: "string",
      description:
        "English. A photographic description of the very first frame of the video, taken from the context: the person (appearance, outfit, pose, expression), the place, the light and the camera framing. No on-screen text.",
    },
    productVisible: {
      type: "boolean",
      description: "True only when the context or script shows the supplement tub in the first frame.",
    },
    segments: {
      type: "array",
      minItems: count,
      maxItems: count,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["script"],
        properties: { script: { type: "string" } },
      },
    },
  },
});

const PLAN_INSTRUCTIONS = `You prepare a hand-written video script for an image-to-video model that renders at most 15 seconds per clip.

Split the script into the requested number of consecutive parts with the given durations. Rules:
- Keep every spoken line EXACTLY as written: same words, same order, same language and spelling. Never add, drop, translate or rephrase dialogue.
- Cut only between sentences, so each part's dialogue fits naturally in its seconds at the script's speaking pace.
- Rewrite timing marks relative to each part (each part starts at 0:00) and replace any total-duration statement with that part's duration.
- Repeat in every part the global requirements that apply to it (language, voice, delivery, audio requirements).
- From the second part on, state that she continues speaking immediately from the first frame, mid-conversation, with no greeting, pause or restart, in the same continuous recording.
- Keep stage directions (gestures, expressions) with the lines they belong to.
With a single part, return the script unchanged apart from making the duration match.

Also describe the first frame from the context, as a still photograph.`;

const IDENTITY_FROM_PHOTO = `The woman's identity comes from a reference photo given to the image model. In firstFramePrompt do NOT describe her face, facial features, hair (color, length, style), eyes, skin tone, age, ethnicity or body: call her "the woman from the reference photo". Describe only her outfit and accessories, pose, gesture, expression, the place, the light and the camera framing.`;

/** Plans a direct video: first-frame description plus the segment scripts. */
export async function planDirectVideo(input: {
  script: string;
  context: string;
  durationSeconds: number;
  /** The woman comes from a reference photo: the first frame must not describe her looks. */
  withModelReference?: boolean;
  model?: string;
}): Promise<DirectPlan> {
  const seconds = splitDuration(input.durationSeconds);
  const { value } = await generateStructured<{
    firstFramePrompt: string;
    productVisible: boolean;
    segments: Array<{ script: string }>;
  }>({
    name: "direct_video_plan",
    schema: PLAN_SCHEMA(seconds.length),
    instructions: input.withModelReference ? `${PLAN_INSTRUCTIONS}\n\n${IDENTITY_FROM_PHOTO}` : PLAN_INSTRUCTIONS,
    model: input.model ?? DEFAULT_VIDEO_TEXT_MODEL,
    input: [
      `Total duration: ${input.durationSeconds} seconds, vertical 9:16.`,
      `Parts: ${seconds.length} (${seconds.map((value, index) => `part ${index + 1}: ${value} s`).join(", ")}).`,
      "",
      "CONTEXT:",
      input.context,
      "",
      "SCRIPT:",
      input.script,
    ].join("\n"),
  });
  if (value.segments.length !== seconds.length) {
    throw new Error(`El plan devolvió ${value.segments.length} partes en lugar de ${seconds.length}`);
  }
  return {
    firstFramePrompt: value.firstFramePrompt,
    productVisible: value.productVisible,
    segments: value.segments.map((segment, index) => ({ seconds: seconds[index], script: segment.script })),
  };
}

export function buildDirectFramePrompt(plan: DirectPlan, references: { model: boolean; product: boolean }): string {
  return [
    "Vertical 9:16 photorealistic still frame from a smartphone video (TikTok / Reels UGC), natural light, authentic and unpolished, real skin texture with visible pores, no beauty filter.",
    references.model
      ? [
          "Image 1 = MODEL reference, the main identity reference. The woman in the frame is the SAME person as in image 1, not a similar-looking one: same face shape and facial features, eyes, eyebrows, nose, lips, hair color, length and texture, skin tone and body type.",
          "If the scene text below describes her looks differently, image 1 wins. Take from the text only the outfit, accessories, pose, expression, place, light and framing.",
        ].join("\n")
      : "",
    references.product
      ? `Image ${references.model ? 2 : 1} = PRODUCT reference: the supplement tub must look exactly like it, label facing the camera.`
      : "No supplement tub, bottle or packaging in the frame.",
    `Scene: ${plan.firstFramePrompt}`,
    "No on-screen text, captions, subtitles, watermarks or logos.",
    references.model ? "Final check: she must be recognizable as the exact woman in image 1." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDirectClipPrompt(context: string, plan: DirectPlan, index: number): string {
  const segment = plan.segments[index];
  const total = plan.segments.length;
  return [
    total > 1
      ? `PART ${index + 1} OF ${total} of one continuous recording. This clip lasts exactly ${segment.seconds} seconds, vertical 9:16.${
          index > 0
            ? " The first frame is the last frame of the previous part: continue the same take with the same woman, place, framing and light, speaking immediately."
            : ""
        }`
      : `This clip lasts exactly ${segment.seconds} seconds, vertical 9:16.`,
    "",
    context.trim(),
    "",
    segment.script.trim(),
  ].join("\n");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => reject(new Error(`No se pudo ejecutar ffmpeg: ${error.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.trim().split("\n").pop()}`))
    );
  });
}

/** The last frame of a clip, as a PNG, to start the next segment on. */
export async function extractLastFrame(video: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-last-frame-"));
  try {
    const input = path.join(dir, "clip.mp4");
    const output = path.join(dir, "last.png");
    await writeFile(input, video);
    await runFfmpeg(["-y", "-sseof", "-0.2", "-i", input, "-update", "1", "-frames:v", "1", output]);
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function generateFirstFrame(projectId: string, plan: DirectPlan, product: string) {
  await prisma.videoFrame.upsert({
    where: { projectId_sceneIndex_position: { projectId, sceneIndex: 0, position: "inicio" } },
    create: { projectId, sceneIndex: 0, position: "inicio", status: "GENERATING" },
    update: { status: "GENERATING", error: null },
  });
  try {
    const rows =
      product === "ninguno" ? [] : await prisma.videoReference.findMany({ where: { product } });
    const model = rows.find((row) => row.kind === "modelo");
    const tub = plan.productVisible ? rows.find((row) => row.kind === "producto") : undefined;
    const references = [model, tub].filter((row): row is NonNullable<typeof row> => Boolean(row));
    const prompt = buildDirectFramePrompt(plan, { model: Boolean(model), product: Boolean(tub) });
    const image = references.length
      ? await generateWithReferences({
          prompt,
          references: references.map((row) => ({ data: row.data, mimeType: row.mimeType })),
          size: FRAME_SIZE,
          model: videoImageModel(),
        })
      : await generateImage({ prompt, size: FRAME_SIZE, model: videoImageModel() });
    return await prisma.videoFrame.update({
      where: { projectId_sceneIndex_position: { projectId, sceneIndex: 0, position: "inicio" } },
      data: { status: "READY", prompt, data: new Uint8Array(image.data), mimeType: image.mimeType, error: null },
    });
  } catch (error) {
    return prisma.videoFrame.update({
      where: { projectId_sceneIndex_position: { projectId, sceneIndex: 0, position: "inicio" } },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

async function generateSegmentClip(projectId: string, context: string, plan: DirectPlan, index: number) {
  const where = { projectId_sceneIndex: { projectId, sceneIndex: index } };
  await prisma.videoClip.upsert({
    where,
    create: { projectId, sceneIndex: index, status: "GENERATING" },
    update: { status: "GENERATING", error: null },
  });
  try {
    let frame: Uint8Array;
    let frameMimeType: string;
    if (index === 0) {
      const first = await prisma.videoFrame.findUnique({
        where: { projectId_sceneIndex_position: { projectId, sceneIndex: 0, position: "inicio" } },
      });
      if (first?.status !== "READY" || !first.data) throw new Error("Falta la imagen inicial");
      frame = first.data;
      frameMimeType = first.mimeType ?? "image/webp";
    } else {
      const previous = await prisma.videoClip.findUnique({
        where: { projectId_sceneIndex: { projectId, sceneIndex: index - 1 } },
      });
      if (previous?.status !== "READY" || !previous.data) throw new Error(`Falta el clip ${index}`);
      frame = await extractLastFrame(previous.data);
      frameMimeType = "image/png";
    }
    const prompt = buildDirectClipPrompt(context, plan, index);
    await prisma.videoClip.update({ where, data: { prompt } });
    const video = await generateClipVideo({
      prompt,
      frame,
      frameMimeType,
      duration: plan.segments[index].seconds,
      name: `${projectId}-parte-${index + 1}`,
    });
    return await prisma.videoClip.update({
      where,
      data: { status: "READY", data: new Uint8Array(video), mimeType: "video/mp4", error: null },
    });
  } catch (error) {
    return prisma.videoClip.update({
      where,
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

/**
 * Runs (or resumes) a direct video end to end. Steps already done are kept,
 * so a retry after a failure picks up where it stopped. It stops after the
 * first image ("AWAITING_APPROVAL") until imageApprovedAt is set.
 */
export async function runDirectVideo(projectId: string): Promise<string> {
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { frames: true, clips: true, render: true },
  });
  if (project.mode !== "directo" || !project.directScript || !project.directContext) {
    throw new Error("No es un video directo");
  }
  await prisma.videoProject.update({ where: { id: projectId }, data: { error: null } });
  try {
    let plan = project.directPlan as DirectPlan | null;
    if (!plan?.segments?.length) {
      plan = await planDirectVideo({
        script: project.directScript,
        context: project.directContext,
        durationSeconds: project.durationSeconds ?? DIRECT_DURATION.default,
        withModelReference: project.product !== "ninguno",
        model: project.model ?? undefined,
      });
      await prisma.videoProject.update({
        where: { id: projectId },
        data: { directPlan: plan as unknown as Prisma.InputJsonValue },
      });
    }

    const firstFrame = project.frames.find((frame) => frame.sceneIndex === 0 && frame.position === "inicio");
    if (firstFrame?.status !== "READY") {
      const frame = await generateFirstFrame(projectId, plan, project.product);
      if (frame.status !== "READY") throw new Error(`La imagen inicial falló: ${frame.error ?? ""}`);
    }

    const clips = await prisma.videoClip.findMany({ where: { projectId } });
    // Wait for the reviewer to approve the image (projects that already
    // have clips started before this step existed and keep going).
    if (!project.imageApprovedAt && clips.length === 0) return "AWAITING_APPROVAL";
    for (let index = 0; index < plan.segments.length; index++) {
      if (clips.find((clip) => clip.sceneIndex === index)?.status === "READY") continue;
      const clip = await generateSegmentClip(projectId, project.directContext, plan, index);
      if (clip.status !== "READY") throw new Error(`El clip ${index + 1} falló: ${clip.error ?? ""}`);
    }

    await prepareRender(projectId);
    const render = await renderVideo(projectId);
    if (render.status !== "READY") throw new Error(`No se pudo unir el video: ${render.error ?? ""}`);
    return "READY";
  } catch (error) {
    await prisma.videoProject.update({
      where: { id: projectId },
      data: { error: errorMessage(error).slice(0, 2000) },
    });
    return "FAILED";
  }
}

/**
 * Marks what has to be redone before a rerun: the image (and so every clip),
 * or one clip and the ones after it, since each starts on the previous one.
 */
export async function resetDirectVideo(projectId: string, target: { kind: "image" } | { kind: "clip"; index: number } | { kind: "plan" }) {
  if (target.kind === "plan") {
    await prisma.videoProject.update({ where: { id: projectId }, data: { directPlan: Prisma.DbNull } });
  }
  if (target.kind === "plan" || target.kind === "image") {
    await prisma.videoFrame.deleteMany({ where: { projectId } });
    await prisma.videoProject.update({ where: { id: projectId }, data: { imageApprovedAt: null } });
  }
  const fromIndex = target.kind === "clip" ? target.index : 0;
  await prisma.videoClip.deleteMany({ where: { projectId, sceneIndex: { gte: fromIndex } } });
  const render = await prisma.videoRender.findUnique({ where: { projectId } });
  if (render?.videoUrl) await del(render.videoUrl).catch(() => {});
  await prisma.videoRender.deleteMany({ where: { projectId } });
}
