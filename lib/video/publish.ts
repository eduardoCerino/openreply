import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  createReelContainer,
  getContainerStatus,
  getMediaPermalink,
  publishContainer,
} from "@/lib/meta/client";
import {
  finishReelUpload,
  getVideoStatus,
  startReelUpload,
  uploadReelFromUrl,
} from "@/lib/meta/facebook";
import type { VideoScript } from "@/lib/video/prompt";

// Phase 5: post the final video as an Instagram Reel and/or a Facebook Page
// Reel. TikTok will get its own platform value on VideoPublication later.

export const VIDEO_PLATFORMS = ["instagram", "facebook"] as const;
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

export async function publishToFacebook(publicationId: string) {
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
    const page = publication.facebookPageId
      ? await prisma.facebookPage.findUnique({ where: { id: publication.facebookPageId } })
      : null;
    if (!page) throw new Error("La Página de Facebook ya no está conectada");
    const token = decryptToken(page.accessToken);

    // A retry after the upload went through only has to wait for it again.
    let videoId = publication.mediaId;
    if (!videoId) {
      const upload = await startReelUpload(token, page.pageId);
      await uploadReelFromUrl(token, upload.uploadUrl, videoUrl);
      const finished = await finishReelUpload(token, page.pageId, upload.videoId, publication.caption);
      videoId = upload.videoId;
      await prisma.videoPublication.update({
        where: { id: publication.id },
        data: { mediaId: videoId, ...(finished.post_id ? { externalPostId: finished.post_id } : {}) },
      });
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = await getVideoStatus(token, videoId);
    while (status.publishStatus !== "complete" && status.videoStatus !== "ready") {
      if (status.videoStatus === "error" || status.publishStatus === "error") {
        await prisma.videoPublication.update({ where: { id: publication.id }, data: { mediaId: null } });
        throw new Error(`Facebook no procesó el video${status.error ? `: ${status.error}` : ""}`);
      }
      if (Date.now() > deadline) throw new Error("Facebook tardó más de 10 minutos en procesar el video; reintenta");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      status = await getVideoStatus(token, videoId);
    }

    return await prisma.videoPublication.update({
      where: { id: publication.id },
      data: {
        status: "PUBLISHED",
        permalink: status.permalink ?? `https://www.facebook.com/reel/${videoId}`,
        ...(status.postId ? { externalPostId: status.postId } : {}),
        publishedAt: new Date(),
        error: null,
      },
    });
  } catch (error) {
    return prisma.videoPublication.update({
      where: { id: publication.id },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

/** Runs the publication on its own platform. */
export async function publishVideo(publicationId: string) {
  const { platform } = await prisma.videoPublication.findUniqueOrThrow({
    where: { id: publicationId },
    select: { platform: true },
  });
  return platform === "facebook" ? publishToFacebook(publicationId) : publishToInstagram(publicationId);
}

/**
 * The Instagram Reel ids that a Facebook post maps to: when the panel posted
 * the same video to both, an Instagram campaign on that Reel also runs on the
 * Facebook post. Comment webhooks carry "<pageId>_<postId>", so both forms
 * and the bare video id are matched.
 */
export async function instagramMediaIdsForFacebookPost(postId: string): Promise<string[]> {
  const candidates = [...new Set([postId, postId.split("_").pop() ?? postId])];
  const facebook = await prisma.videoPublication.findMany({
    where: {
      platform: "facebook",
      status: "PUBLISHED",
      OR: [{ mediaId: { in: candidates } }, { externalPostId: { in: candidates } }],
    },
    select: { projectId: true },
  });
  if (!facebook.length) return [];
  const instagram = await prisma.videoPublication.findMany({
    where: {
      platform: "instagram",
      status: "PUBLISHED",
      projectId: { in: facebook.map((row) => row.projectId) },
      mediaId: { not: null },
    },
    select: { mediaId: true },
  });
  return instagram.map((row) => row.mediaId!);
}
