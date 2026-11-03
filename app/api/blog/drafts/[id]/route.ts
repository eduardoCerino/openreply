import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const post = await prisma.blogPost.findUnique({
    where: { id },
    omit: { imageData: true },
  });
  if (!post) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const hasImage = Boolean(
    await prisma.blogPost.count({ where: { id, imageData: { not: null } } })
  );
  return NextResponse.json({ success: true, data: { ...post, hasImage } });
}

/** Descartar: the draft leaves the panel and its cover is dropped. */
export async function DELETE(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const discarded = await prisma.blogPost.updateMany({
    where: { id, status: { in: ["READY", "FAILED", "GENERATING"] } },
    data: { status: "DISCARDED", imageData: null },
  });
  if (discarded.count === 0) {
    return NextResponse.json(
      { success: false, error: "Este artículo ya se publicó o se está publicando" },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
}
