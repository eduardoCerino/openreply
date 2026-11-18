import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { prepareClips } from "@/lib/video/clips";
import { enqueueClipsJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Phase 3: animate every missing or failed scene clip (Grok Imagine via AI Gateway). */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const missing = ["AI_GATEWAY_API_KEY", "BLOB_READ_WRITE_TOKEN"].filter((name) => !process.env[name]);
  if (missing.length) {
    return NextResponse.json(
      { success: false, error: `Falta ${missing.join(" y ")} (en Vercel y en el worker)` },
      { status: 400 }
    );
  }
  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({ where: { id }, select: { status: true } });
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (project.status !== "SCRIPT_APPROVED") {
    return NextResponse.json({ success: false, error: "Primero aprueba el guion" }, { status: 409 });
  }
  try {
    const queued = await prepareClips(id);
    if (queued > 0) await enqueueClipsJob(id);
    return NextResponse.json({ success: true, data: { queued } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "No se pudieron preparar los clips" },
      { status: 409 }
    );
  }
}
