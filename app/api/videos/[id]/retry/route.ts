import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { STALE_SCRIPT_MS } from "@/lib/video/constants";
import { enqueueScriptJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/**
 * Re-queues a script that failed or has been "writing" for too long, which
 * happens when the worker restarts (a deploy) in the middle of a run.
 */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const claimed = await prisma.videoProject.updateMany({
    where: {
      id,
      OR: [
        { status: "FAILED" },
        { status: "GENERATING_SCRIPT", updatedAt: { lt: new Date(Date.now() - STALE_SCRIPT_MS) } },
      ],
    },
    data: { status: "GENERATING_SCRIPT", error: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { success: false, error: "Este guion todavía se está escribiendo; espera un poco antes de reintentar" },
      { status: 409 }
    );
  }
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id },
    select: { revision: true },
  });
  await enqueueScriptJob(id, project.revision, { retry: true });
  return NextResponse.json({ success: true });
}
