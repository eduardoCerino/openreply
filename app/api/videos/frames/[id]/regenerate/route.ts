import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueueFrameJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Regenerate a single frame (a bad face, a wrong pose). */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const updated = await prisma.videoFrame.updateMany({
    where: { id, status: { not: "GENERATING" } },
    data: { status: "PENDING", error: null },
  });
  if (updated.count === 0) {
    return NextResponse.json({ success: false, error: "Este fotograma se está generando" }, { status: 409 });
  }
  await enqueueFrameJob(id);
  return NextResponse.json({ success: true });
}
