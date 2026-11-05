import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { CTA_KEYWORD_PATTERN, HOOK_MOLDS, VIDEO_FORMAT_IDS } from "@/lib/video/constants";
import { enqueueScriptJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

const createSchema = z.object({
  idea: z.string().trim().min(5, "Escribe la idea del video").max(2000),
  product: z.enum(["creatina", "inositol"]),
  channel: z.enum(["organico", "pagado"]).default("organico"),
  format: z.enum(["auto", ...VIDEO_FORMAT_IDS] as [string, ...string[]]).default("auto"),
  duration: z.enum(["auto", "estandar", "corto"]).default("auto"),
  awareness: z.enum(["0", "1", "2", "auto"]).default("1"),
  hookVoice: z.enum(["auto", "segunda", "primera"]).default("auto"),
  ideaValidated: z.boolean().default(false),
  ctaKeyword: z
    .string()
    .trim()
    .transform((value) => value.replace(/^#+/, "").toUpperCase())
    .pipe(z.string().regex(CTA_KEYWORD_PATTERN, "La palabra clave del CTA es una sola palabra de 3 a 14 letras"))
    .optional()
    .or(z.literal("").transform(() => undefined)),
  previousFormat: z.enum(VIDEO_FORMAT_IDS as [string, ...string[]]).optional(),
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
      format: true,
      script: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    success: true,
    data: projects.map(({ script, ...project }) => ({
      ...project,
      title: (script as { title?: string } | null)?.title ?? null,
      chosenFormat: (script as { format?: string } | null)?.format ?? null,
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
  const { ideaValidated, previousFormat, format } = parsed.data;
  if (ideaValidated && !previousFormat) {
    return NextResponse.json(
      { success: false, error: "Indica en qué formato se publicó la idea validada" },
      { status: 400 }
    );
  }
  if (ideaValidated && format === previousFormat) {
    return NextResponse.json(
      { success: false, error: "Una idea validada se vuelve a publicar en un formato distinto al anterior" },
      { status: 400 }
    );
  }
  const project = await prisma.videoProject.create({
    data: {
      ...parsed.data,
      previousFormat: ideaValidated ? previousFormat : null,
      createdById: context.userId,
    },
  });
  await enqueueScriptJob(project.id, project.revision);
  return NextResponse.json({ success: true, data: { id: project.id } });
}
