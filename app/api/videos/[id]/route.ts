import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { error, context } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({
    where: { id },
    include: {
      frames: {
        select: { id: true, sceneIndex: true, position: true, status: true, error: true, updatedAt: true },
        orderBy: [{ sceneIndex: "asc" }, { position: "desc" }],
      },
      clips: {
        select: { id: true, sceneIndex: true, status: true, error: true, updatedAt: true },
        orderBy: { sceneIndex: "asc" },
      },
      render: { select: { status: true, videoUrl: true, sizeBytes: true, error: true, updatedAt: true } },
      publications: {
        select: {
          id: true,
          platform: true,
          status: true,
          caption: true,
          instagramAccountId: true,
          permalink: true,
          error: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const instagramAccounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: context.workspaceId, provider: "META" },
    select: { id: true, username: true },
    orderBy: { connectedAt: "asc" },
  });
  return NextResponse.json({ success: true, data: { ...project, instagramAccounts } });
}

export async function DELETE(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const discarded = await prisma.videoProject.updateMany({
    where: { id, status: { not: "DISCARDED" } },
    data: { status: "DISCARDED" },
  });
  if (discarded.count === 0) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
