import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { enqueueScriptJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

const schema = z.object({
  feedback: z.string().trim().min(3, "Describe qué cambiar").max(2000),
});

/** "Pedir cambios": rewrites the script applying the reviewer's feedback. */
export async function POST(request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const updated = await prisma.videoProject.updateMany({
    where: { id, status: { in: ["SCRIPT_READY", "SCRIPT_APPROVED", "FAILED"] } },
    data: {
      status: "GENERATING_SCRIPT",
      feedback: parsed.data.feedback,
      approvedAt: null,
      error: null,
    },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { success: false, error: "El guion se está generando o fue descartado" },
      { status: 409 }
    );
  }
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id },
    select: { revision: true },
  });
  await enqueueScriptJob(id, project.revision);
  return NextResponse.json({ success: true });
}
