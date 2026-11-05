import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { prepareFrames } from "@/lib/video/frames";
import { enqueueFramesJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Phase 2: generate every missing or failed frame of an approved script. */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({
    where: { id },
    select: { status: true, product: true },
  });
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (project.status !== "SCRIPT_APPROVED") {
    return NextResponse.json(
      { success: false, error: "Primero aprueba el guion" },
      { status: 409 }
    );
  }
  const model = await prisma.videoReference.findUnique({
    where: { product_kind: { product: project.product, kind: "modelo" } },
    select: { id: true },
  });
  if (!model) {
    return NextResponse.json(
      { success: false, error: `Sube primero la foto de la modelo de ${project.product} en Videos` },
      { status: 400 }
    );
  }
  const queued = await prepareFrames(id);
  if (queued > 0) await enqueueFramesJob(id);
  return NextResponse.json({ success: true, data: { queued } });
}
