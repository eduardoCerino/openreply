import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { HOOK_MOLDS } from "@/lib/video/constants";
import { enqueueScriptJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

const createSchema = z.object({
  idea: z.string().trim().min(5, "Escribe la idea del video").max(2000),
  product: z.enum(["creatina", "inositol"]),
  channel: z.enum(["organico", "pagado"]).default("organico"),
  hookMold: z.enum(HOOK_MOLDS).optional(),
});

export async function GET() {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const projects = await prisma.videoProject.findMany({
    where: { status: { not: "DISCARDED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      status: true,
      idea: true,
      product: true,
      channel: true,
      script: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    success: true,
    data: projects.map(({ script, ...project }) => ({
      ...project,
      title: (script as { title?: string } | null)?.title ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireBlogAdmin();
  if (error) return error;
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Falta la variable de entorno OPENAI_API_KEY" },
      { status: 400 }
    );
  }
  const project = await prisma.videoProject.create({
    data: { ...parsed.data, createdById: context.userId },
  });
  await enqueueScriptJob(project.id, project.revision);
  return NextResponse.json({ success: true, data: { id: project.id } });
}
