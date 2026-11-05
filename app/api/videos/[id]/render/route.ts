import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueueRenderJob } from "@/lib/video/jobs";
import { prepareRender } from "@/lib/video/render";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Phase 4: join every scene clip into the final video (in the worker). */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: "Falta BLOB_READ_WRITE_TOKEN: conecta un Blob store en Vercel y copia el token al worker" },
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
    await prepareRender(id);
    await enqueueRenderJob(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "No se pudo preparar el video" },
      { status: 409 }
    );
  }
}
