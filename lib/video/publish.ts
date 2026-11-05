import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  createReelContainer,
  getContainerStatus,
  getMediaPermalink,
  publishContainer,
} from "@/lib/meta/client";
import type { VideoScript } from "@/lib/video/prompt";

// Phase 5: post the final video. Instagram Reels for now; Facebook and TikTok
// get their own platform value on VideoPublication later.

export const VIDEO_PLATFORMS = ["instagram"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

const CAPTION_MAX = 2200;
const HASHTAGS_MAX = 30;
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Default Reel caption: the script's caption plus its hashtags. */
export function buildCaption(script: Pick<VideoScript, "caption" | "hashtags"> | null): string {
  if (!script) return "";
  const tags = (script.hashtags ?? [])
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/\s+/g, ""))
    .filter(Boolean)
    .slice(0, HASHTAGS_MAX)
    .map((tag) => `#${tag}`);
  return [script.caption?.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
}

/** Instagram's own limits, checked before anything is sent. */
export function validateCaption(caption: string): string | null {
  if (caption.length > CAPTION_MAX) return `El caption pasa de ${CAPTION_MAX} caracteres`;
  if ((caption.match(/#[^\s#]+/g) ?? []).length > HASHTAGS_MAX) return `Instagram acepta máximo ${HASHTAGS_MAX} hashtags`;
  return null;
}

export async function publishToInstagram(publicationId: string) {
  const publication = await prisma.videoPublication.findUniqueOrThrow({
    where: { id: publicationId },
    include: { project: { include: { render: true } } },
  });
  await prisma.videoPublication.update({
    where: { id: publication.id },
    data: { status: "PUBLISHING", error: null },
  });
  try {
    const videoUrl = publication.project.render?.status === "READY" ? publication.project.render.videoUrl : null;
    if (!videoUrl) throw new Error("El video final no está listo");
    const account = publication.instagramAccountId
      ? await prisma.instagramAccount.findUnique({ where: { id: publication.instagramAccountId } })
      : null;
    if (!account) throw new Error("La cuenta de Instagram ya no está conectada");
    if (account.provider !== "META") throw new Error("Publicar Reels solo funciona con cuentas conectadas directo con Meta");
    const token = decryptToken(account.accessToken);

    // A container lasts 24 h; reuse it when a retry follows a timeout.
    let containerId = publication.containerId;
    if (!containerId) {
      containerId = await createReelContainer(token, { videoUrl, caption: publication.caption });
      await prisma.videoPublication.update({ where: { id: publication.id }, data: { containerId } });
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      const { statusCode, status } = await getContainerStatus(token, containerId);
      if (statusCode === "FINISHED" || statusCode === "PUBLISHED") break;
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        await prisma.videoPublication.update({ where: { id: publication.id }, data: { containerId: null } });
        throw new Error(`Instagram no procesó el video (${statusCode}${status ? `: ${status}` : ""})`);
      }
      if (Date.now() > deadline) throw new Error("Instagram tardó más de 10 minutos en procesar el video; reintenta");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const mediaId = await publishContainer(token, containerId);
    const permalink = await getMediaPermalink(token, mediaId).catch(() => null);
    return await prisma.videoPublication.update({
      where: { id: publication.id },
      data: { status: "PUBLISHED", mediaId, permalink, publishedAt: new Date(), error: null },
    });
  } catch (error) {
    return prisma.videoPublication.update({
      where: { id: publication.id },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}
