import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { PUBLISH_JOB, enqueueBlogJob, getBlogQueue } from "@/lib/blog/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { status: true } });
  if (!post) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (post.status !== "READY") {
    return NextResponse.json(
      { success: false, error: `No se puede publicar un borrador en estado ${post.status}` },
      { status: 409 }
    );
  }
  // A retry after a failed publish reuses the job id; drop the finished job
  // first so BullMQ accepts the new one.
  await (await getBlogQueue().getJob(`${PUBLISH_JOB}_${id}`))?.remove().catch(() => {});
  await enqueueBlogJob({ kind: PUBLISH_JOB, postId: id });
  return NextResponse.json({ success: true });
}
