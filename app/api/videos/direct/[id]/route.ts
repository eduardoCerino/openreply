import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { resetDirectVideo } from "@/lib/video/direct";
import { enqueueDirectJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("approve-image") }),
  z.object({ action: z.literal("regenerate-image") }),
  z.object({ action: z.literal("regenerate-clip"), index: z.number().int().min(0) }),
  z.object({ action: z.literal("replan") }),
]);

/**
 * Moves a direct video along: "approve-image" accepts the first image and
 * starts the clips, "retry" resumes after a failure,
 * "regenerate-image" redoes the image and every clip, "regenerate-clip"
 * redoes one clip and the ones after it, "replan" splits the script again.
 */
export async function POST(request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Acción inválida" }, { status: 400 });

  const project = await prisma.videoProject.findUnique({
    where: { id },
    include: { frames: true, clips: true, render: true, publications: true },
  });
  if (!project || project.mode !== "directo") {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const busy =
    [...project.frames, ...project.clips].some((row) => row.status === "PENDING" || row.status === "GENERATING") ||
    project.render?.status === "PENDING" ||
    project.render?.status === "RENDERING";
  if (busy) return NextResponse.json({ success: false, error: "Se está generando; espera a que termine" }, { status: 409 });
  if (parsed.data.action !== "retry" && project.publications.some((row) => row.status !== "FAILED")) {
    return NextResponse.json({ success: false, error: "Este video ya se publicó o se está publicando" }, { status: 409 });
  }

  if (parsed.data.action === "approve-image") {
    const frame = project.frames.find((row) => row.sceneIndex === 0 && row.position === "inicio");
    if (frame?.status !== "READY") {
      return NextResponse.json({ success: false, error: "La imagen inicial aún no está lista" }, { status: 409 });
    }
    if (project.imageApprovedAt) {
      return NextResponse.json({ success: false, error: "La imagen ya está aprobada" }, { status: 409 });
    }
    await prisma.videoProject.update({ where: { id }, data: { imageApprovedAt: new Date() } });
  }
  if (parsed.data.action === "regenerate-image") await resetDirectVideo(id, { kind: "image" });
  if (parsed.data.action === "regenerate-clip") await resetDirectVideo(id, { kind: "clip", index: parsed.data.index });
  if (parsed.data.action === "replan") await resetDirectVideo(id, { kind: "plan" });
  await prisma.videoProject.update({ where: { id }, data: { error: null } });
  await enqueueDirectJob(id);
  return NextResponse.json({ success: true });
}
