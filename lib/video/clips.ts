import { prisma } from "@/lib/db/client";
import { CLIP_SECONDS } from "@/lib/video/constants";
import type { VideoScene, VideoScript } from "@/lib/video/prompt";
import { createVideoPrediction, downloadOutput, uploadFile, waitForPrediction } from "@/lib/video/pruna";

// Phase 3: one 5-second clip per scene, animated by Pruna's P-Video from the
// scene's start frame. Pruna also generates the audio, so the prompt carries
// the scene's voiceover (already in phonetic spelling for a Spanish voice).

const PARALLEL_CLIPS = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildClipPrompt(script: VideoScript, scene: VideoScene): string {
  const lines = scene.lines ?? [];
  const speakers = new Set(lines.map((line) => line.speaker));
  const spoken =
    speakers.size > 1
      ? lines.map((line) => `${line.speaker}: "${line.text}"`).join(" ")
      : `"${lines.map((line) => line.text).join(" ") || scene.voiceover}"`;
  const pause = lines.some((line) => /\bpausa\b/i.test(line.direction ?? ""))
    ? " Leave a short, deliberate pause where it lands naturally."
    : "";
  const actions = lines.map((line) => line.direction).filter(Boolean).join("; ");

  return [
    "Vertical 9:16 smartphone video for Instagram Reels / TikTok. Animate this exact frame: the same woman, same face, hair and outfit, same place and light. Natural, slightly handheld, realistic motion.",
    scene.motionPrompt ? `Motion: ${scene.motionPrompt}` : "",
    scene.shots?.length ? `Camera: ${scene.shots.join(" Then ")}` : "",
    actions ? `Actions: ${actions}.` : "",
    `Audio: she speaks natural Mexican Spanish, warm and conversational, lip-synced to her mouth, saying exactly: ${spoken}.${pause}`,
    "Only room ambience under the voice, no background music. No on-screen text, captions or watermarks.",
    script.visualStyle ? `Look: ${script.visualStyle}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Queues one clip per scene (missing or failed ones). Needs every scene's
 * start frame to be ready, since each clip is animated from it.
 */
export async function prepareClips(projectId: string): Promise<number> {
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { frames: { where: { position: "inicio", status: "READY" }, select: { sceneIndex: true } } },
  });
  const script = project.script as VideoScript | null;
  if (!script?.scenes?.length) throw new Error("El proyecto no tiene guion");
  const readyScenes = new Set(project.frames.map((frame) => frame.sceneIndex));
  const missing = script.scenes.map((_, index) => index).filter((index) => !readyScenes.has(index));
  if (missing.length) {
    throw new Error(`Faltan las imágenes de la escena ${missing.map((index) => index + 1).join(", ")}`);
  }

  let queued = 0;
  for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
    const existing = await prisma.videoClip.findUnique({
      where: { projectId_sceneIndex: { projectId, sceneIndex } },
      select: { status: true },
    });
    if (existing?.status === "READY") continue;
    await prisma.videoClip.upsert({
      where: { projectId_sceneIndex: { projectId, sceneIndex } },
      create: { projectId, sceneIndex, status: "PENDING" },
      update: { status: "PENDING", error: null },
    });
    queued++;
  }
  return queued;
}

export async function generateClip(clipId: string) {
  const clip = await prisma.videoClip.findUniqueOrThrow({ where: { id: clipId }, include: { project: true } });
  const script = clip.project.script as VideoScript | null;
  const scene = script?.scenes?.[clip.sceneIndex];
  if (!script || !scene) {
    return prisma.videoClip.update({
      where: { id: clip.id },
      data: { status: "FAILED", error: "La escena ya no existe en el guion" },
    });
  }

  await prisma.videoClip.update({ where: { id: clip.id }, data: { status: "GENERATING", error: null } });
  try {
    const frame = await prisma.videoFrame.findUnique({
      where: {
        projectId_sceneIndex_position: { projectId: clip.projectId, sceneIndex: clip.sceneIndex, position: "inicio" },
      },
    });
    if (frame?.status !== "READY" || !frame.data) throw new Error("Falta la imagen inicial de esta escena");

    const image = await uploadFile(frame.data, frame.mimeType ?? "image/webp", `escena-${clip.sceneIndex + 1}.webp`);
    const prompt = buildClipPrompt(script, scene);
    const prediction = await createVideoPrediction({ prompt, image, duration: CLIP_SECONDS });
    await prisma.videoClip.update({ where: { id: clip.id }, data: { prompt, predictionId: prediction.id } });
    const generationUrl = await waitForPrediction(prediction.getUrl);
    const video = await downloadOutput(generationUrl);
    return await prisma.videoClip.update({
      where: { id: clip.id },
      data: { status: "READY", data: new Uint8Array(video), mimeType: "video/mp4", error: null },
    });
  } catch (error) {
    return prisma.videoClip.update({
      where: { id: clip.id },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

/** Every pending clip of a project, a few at a time (Pruna allows 250/min). */
export async function generatePendingClips(projectId: string) {
  const clips = await prisma.videoClip.findMany({
    where: { projectId, status: { in: ["PENDING", "GENERATING"] } },
    select: { id: true },
    orderBy: { sceneIndex: "asc" },
  });
  let ready = 0;
  for (let start = 0; start < clips.length; start += PARALLEL_CLIPS) {
    const batch = clips.slice(start, start + PARALLEL_CLIPS);
    const results = await Promise.all(batch.map((clip) => generateClip(clip.id)));
    ready += results.filter((result) => result.status === "READY").length;
  }
  return { total: clips.length, ready };
}
