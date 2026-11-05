import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueueClipJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Regenerate a single clip with P-Video. */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const updated = await prisma.videoClip.updateMany({
    where: { id, status: { not: "GENERATING" } },
    data: { status: "PENDING", error: null },
  });
  if (updated.count === 0) {
    return NextResponse.json({ success: false, error: "Este clip se está generando" }, { status: 409 });
  }
  await enqueueClipJob(id);
  return NextResponse.json({ success: true });
}
