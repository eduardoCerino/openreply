import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueuePublishJob } from "@/lib/video/jobs";
import { validateCaption, VIDEO_PLATFORMS, type VideoPlatform } from "@/lib/video/publish";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Phase 5: post the final video as an Instagram and/or Facebook Reel (in the worker). */
export async function POST(request: NextRequest, ctx: RouteProps) {
  const { error, context } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    caption?: unknown;
    platforms?: unknown;
    instagramAccountId?: unknown;
    facebookPageId?: unknown;
  };
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const requested = Array.isArray(body.platforms) ? body.platforms : ["instagram"];
  const platforms = VIDEO_PLATFORMS.filter((platform) => requested.includes(platform));
  if (!platforms.length) return NextResponse.json({ success: false, error: "Elige dónde publicar" }, { status: 400 });

  const captionError = caption ? validateCaption(caption) : "Escribe el caption";
  if (captionError) return NextResponse.json({ success: false, error: captionError }, { status: 400 });

  const project = await prisma.videoProject.findUnique({ where: { id }, include: { render: true, publications: true } });
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (project.render?.status !== "READY") {
    return NextResponse.json({ success: false, error: "Primero une el video final" }, { status: 409 });
  }

  const targets: Record<VideoPlatform, { instagramAccountId?: string; facebookPageId?: string } | null> = {
    instagram: null,
    facebook: null,
  };
  if (platforms.includes("instagram")) {
    const account = await prisma.instagramAccount.findFirst({
      where: { id: String(body.instagramAccountId ?? ""), workspaceId: context.workspaceId, provider: "META" },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ success: false, error: "Elige una cuenta de Instagram conectada" }, { status: 400 });
    targets.instagram = { instagramAccountId: account.id };
  }
  if (platforms.includes("facebook")) {
    const page = await prisma.facebookPage.findFirst({
      where: { id: String(body.facebookPageId ?? ""), workspaceId: context.workspaceId },
      select: { id: true },
    });
    if (!page) return NextResponse.json({ success: false, error: "Elige una Página de Facebook conectada" }, { status: 400 });
    targets.facebook = { facebookPageId: page.id };
  }

  for (const platform of platforms) {
    const existing = project.publications.find((publication) => publication.platform === platform);
    if (existing && existing.status !== "FAILED") {
      const label = platform === "facebook" ? "Facebook" : "Instagram";
      return NextResponse.json(
        { success: false, error: existing.status === "PUBLISHED" ? `Este video ya está publicado en ${label}` : `Ya se está publicando en ${label}` },
        { status: 409 }
      );
    }
  }

  for (const platform of platforms) {
    const target = targets[platform]!;
    const existing = project.publications.find((publication) => publication.platform === platform);
    // A new caption or destination needs a fresh upload/container.
    const reset =
      existing &&
      (existing.caption !== caption ||
        existing.instagramAccountId !== (target.instagramAccountId ?? null) ||
        existing.facebookPageId !== (target.facebookPageId ?? null));
    const publication = await prisma.videoPublication.upsert({
      where: { projectId_platform: { projectId: id, platform } },
      create: { projectId: id, platform, status: "PENDING", caption, ...target, createdById: context.userId },
      update: {
        status: "PENDING",
        caption,
        ...target,
        error: null,
        ...(reset ? { containerId: null, mediaId: null, externalPostId: null } : {}),
      },
    });
    await enqueuePublishJob(publication.id);
  }
  return NextResponse.json({ success: true });
}
