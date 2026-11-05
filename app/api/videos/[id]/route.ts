import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({
    where: { id },
    include: {
      frames: {
        select: { id: true, sceneIndex: true, position: true, status: true, error: true, updatedAt: true },
        orderBy: [{ sceneIndex: "asc" }, { position: "desc" }],
      },
    },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: project });
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
