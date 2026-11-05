import { prisma } from "@/lib/db/client";
import { generateWithReferences } from "@/lib/blog/openai";
import {
  FRAME_POSITIONS,
  FRAME_SIZE,
  type FramePosition,
  type VideoProduct,
} from "@/lib/video/constants";
import type { VideoScene, VideoScript } from "@/lib/video/prompt";

// Phase 2: the start and end frame of every scene, generated from the model's
// and the product's reference photos so the same woman and the same tub
// appear across the whole video.

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ReferenceImage {
  label: string;
  data: Uint8Array;
  mimeType: string;
}

export function buildFramePrompt({
  script,
  scene,
  position,
  references,
}: {
  script: VideoScript;
  scene: VideoScene;
  position: FramePosition;
  references: ReferenceImage[];
}): string {
  const shots = scene.shots ?? [];
  const shot = position === "inicio" ? shots[0] : shots[shots.length - 1];
  const framePrompt = position === "inicio" ? scene.startFramePrompt : scene.endFramePrompt;
  const labels = references.map((reference, index) => `Image ${index + 1} = ${reference.label}.`).join(" ");
  const hasModel = references.some((reference) => reference.label.startsWith("MODEL"));
  const hasProduct = references.some((reference) => reference.label.startsWith("PRODUCT"));
  const hasStart = references.some((reference) => reference.label.startsWith("START FRAME"));

  return [
    "Vertical 9:16 photorealistic frame from a short-form social video (Instagram Reels / TikTok), shot on a phone, natural light, authentic and unpolished, real skin texture.",
    labels,
    hasModel
      ? "The woman on screen is the same person as the MODEL reference: same face, hair, skin tone and body type. Keep her identity exactly; change only clothing, pose, expression and setting as described. Tasteful, non-revealing framing."
      : "",
    hasProduct
      ? "The supplement tub must look exactly like the PRODUCT reference: same red lid, pink label, logo and proportions, label facing the camera."
      : "No supplement tub, bottle or packaging in the frame.",
    hasStart
      ? "This is the LAST frame of the same continuous shot that begins with the START FRAME: same location, lighting, outfit and camera setup, after the movement described below."
      : "",
    `Scene: ${framePrompt}`,
    shot ? `Camera: ${shot}.` : "",
    script.visualStyle ? `Visual style: ${script.visualStyle}.` : "",
    "No on-screen text, captions, subtitles, watermarks or extra logos (text is added in editing). Nothing clinical.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadReferences(product: VideoProduct) {
  const rows = await prisma.videoReference.findMany({ where: { product } });
  return {
    model: rows.find((row) => row.kind === "modelo") ?? null,
    product: rows.find((row) => row.kind === "producto") ?? null,
  };
}

/** Creates the 2 frames per scene (missing or failed ones) as PENDING. */
export async function prepareFrames(projectId: string): Promise<number> {
  const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
  const script = project.script as VideoScript | null;
  if (!script?.scenes?.length) throw new Error("El proyecto no tiene guion");
  let queued = 0;
  for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
    for (const position of FRAME_POSITIONS) {
      const existing = await prisma.videoFrame.findUnique({
        where: { projectId_sceneIndex_position: { projectId, sceneIndex, position } },
        select: { status: true },
      });
      if (existing?.status === "READY") continue;
      await prisma.videoFrame.upsert({
        where: { projectId_sceneIndex_position: { projectId, sceneIndex, position } },
        create: { projectId, sceneIndex, position, status: "PENDING" },
        update: { status: "PENDING", error: null },
      });
      queued++;
    }
  }
  return queued;
}

/** Generates one frame; an end frame waits for (and uses) its start frame. */
export async function generateFrame(frameId: string) {
  const frame = await prisma.videoFrame.findUniqueOrThrow({
    where: { id: frameId },
    include: { project: true },
  });
  const script = frame.project.script as VideoScript | null;
  const scene = script?.scenes?.[frame.sceneIndex];
  if (!script || !scene) {
    return prisma.videoFrame.update({
      where: { id: frame.id },
      data: { status: "FAILED", error: "La escena ya no existe en el guion" },
    });
  }

  await prisma.videoFrame.update({ where: { id: frame.id }, data: { status: "GENERATING", error: null } });
  try {
    const refs = await loadReferences(frame.project.product as VideoProduct);
    if (!refs.model) throw new Error("Falta la foto de referencia de la modelo para este producto");

    const references: ReferenceImage[] = [
      { label: "MODEL reference (the woman on screen)", data: refs.model.data, mimeType: refs.model.mimeType },
    ];
    if (scene.productVisible && refs.product) {
      references.push({ label: "PRODUCT reference (the tub)", data: refs.product.data, mimeType: refs.product.mimeType });
    }
    if (frame.position === "final") {
      const start = await prisma.videoFrame.findUnique({
        where: {
          projectId_sceneIndex_position: {
            projectId: frame.projectId,
            sceneIndex: frame.sceneIndex,
            position: "inicio",
          },
        },
      });
      if (start?.status === "READY" && start.data) {
        references.push({ label: "START FRAME of this shot", data: start.data, mimeType: start.mimeType ?? "image/webp" });
      }
    }

    const prompt = buildFramePrompt({
      script,
      scene,
      position: frame.position as FramePosition,
      references,
    });
    const image = await generateWithReferences({ prompt, references, size: FRAME_SIZE });
    return await prisma.videoFrame.update({
      where: { id: frame.id },
      data: {
        status: "READY",
        prompt,
        data: new Uint8Array(image.data),
        mimeType: image.mimeType,
        error: null,
      },
    });
  } catch (error) {
    return prisma.videoFrame.update({
      where: { id: frame.id },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

/**
 * All pending frames of a project, in scene order and start before end, one
 * at a time: each end frame needs its start frame as a reference.
 */
export async function generatePendingFrames(projectId: string) {
  const frames = await prisma.videoFrame.findMany({
    where: { projectId, status: { in: ["PENDING", "GENERATING"] } },
    select: { id: true, sceneIndex: true, position: true },
  });
  frames.sort((a, b) => a.sceneIndex - b.sceneIndex || (a.position === "inicio" ? -1 : 1));
  let ready = 0;
  for (const frame of frames) {
    const result = await generateFrame(frame.id);
    if (result.status === "READY") ready++;
  }
  return { total: frames.length, ready };
}
