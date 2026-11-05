import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueuePublishJob } from "@/lib/video/jobs";
import { validateCaption } from "@/lib/video/publish";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Phase 5: post the final video as an Instagram Reel (in the worker). */
export async function POST(request: NextRequest, ctx: RouteProps) {
  const { error, context } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { caption?: unknown; instagramAccountId?: unknown };
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const instagramAccountId = typeof body.instagramAccountId === "string" ? body.instagramAccountId : "";

  const captionError = caption ? validateCaption(caption) : "Escribe el caption";
  if (captionError) return NextResponse.json({ success: false, error: captionError }, { status: 400 });

  const [project, account] = await Promise.all([
    prisma.videoProject.findUnique({ where: { id }, include: { render: true, publications: true } }),
    prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId: context.workspaceId },
      select: { id: true },
    }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (!account) return NextResponse.json({ success: false, error: "Elige una cuenta de Instagram conectada" }, { status: 400 });
  if (project.render?.status !== "READY") {
    return NextResponse.json({ success: false, error: "Primero une el video final" }, { status: 409 });
  }
  const existing = project.publications.find((publication) => publication.platform === "instagram");
  if (existing && (existing.status === "PUBLISHED" || existing.status === "PUBLISHING" || existing.status === "PENDING")) {
    return NextResponse.json(
      { success: false, error: existing.status === "PUBLISHED" ? "Este video ya está publicado en Instagram" : "Ya se está publicando" },
      { status: 409 }
    );
  }

  const publication = await prisma.videoPublication.upsert({
    where: { projectId_platform: { projectId: id, platform: "instagram" } },
    create: {
      projectId: id,
      platform: "instagram",
      status: "PENDING",
      caption,
      instagramAccountId: account.id,
      createdById: context.userId,
    },
    update: {
      status: "PENDING",
      caption,
      instagramAccountId: account.id,
      error: null,
      // A new caption or account needs a new container.
      ...(existing && (existing.caption !== caption || existing.instagramAccountId !== account.id)
        ? { containerId: null }
        : {}),
    },
  });
  await enqueuePublishJob(publication.id);
  return NextResponse.json({ success: true });
}
