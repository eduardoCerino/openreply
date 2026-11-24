import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { DEFAULT_VIDEO_TEXT_MODEL } from "@/lib/video/constants";
import { DIRECT_DURATION, DIRECT_MODELS, DIRECT_PRODUCTS } from "@/lib/video/direct";
import { enqueueDirectJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

const createSchema = z.object({
  script: z.string().trim().min(20, "Pega el guion").max(12000),
  context: z.string().trim().min(20, "Pega el contexto").max(12000),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(DIRECT_DURATION.min, `Mínimo ${DIRECT_DURATION.min} segundos`)
    .max(DIRECT_DURATION.max, `Máximo ${DIRECT_DURATION.max} segundos`)
    .default(DIRECT_DURATION.default),
  product: z.enum(DIRECT_PRODUCTS).default("ninguno"),
  /** Whose model photo to use when there is no product; with a product it is always that product's model. */
  modelProduct: z.enum(DIRECT_MODELS).default("creatina"),
  subtitles: z.boolean().default(true),
});

/** Direct videos, newest first. */
export async function GET() {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const projects = await prisma.videoProject.findMany({
    where: { mode: "directo", status: { not: "DISCARDED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      idea: true,
      product: true,
      durationSeconds: true,
      error: true,
      createdAt: true,
      imageApprovedAt: true,
      frames: { where: { sceneIndex: 0, position: "inicio" }, select: { status: true } },
      _count: { select: { clips: true } },
      render: { select: { status: true } },
      publications: { select: { platform: true, status: true } },
    },
  });
  return NextResponse.json({ success: true, data: projects });
}

/** Creates a direct video and starts the pipeline: plan → image → clips → final video. */
export async function POST(request: NextRequest) {
  const { context, error } = await requireBlogAdmin();
  if (error) return error;
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const missing = ["OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "BLOB_READ_WRITE_TOKEN"].filter((name) => !process.env[name]);
  if (missing.length) {
    return NextResponse.json({ success: false, error: `Falta ${missing.join(", ")} (en Vercel y en el worker)` }, { status: 400 });
  }
  const { script, context: videoContext, durationSeconds, product } = parsed.data;
  // A model photo is always used; with a product, it is that product's model.
  const modelProduct = product === "ninguno" ? parsed.data.modelProduct : product;
  const model = await prisma.videoReference.findFirst({ where: { product: modelProduct, kind: "modelo" }, select: { id: true } });
  if (!model) {
    return NextResponse.json(
      { success: false, error: `Falta la foto de la modelo de ${modelProduct}: súbela en Fotos de referencia` },
      { status: 400 }
    );
  }
  const firstLine = script.split("\n").find((line) => line.trim()) ?? script;
  const project = await prisma.videoProject.create({
    data: {
      mode: "directo",
      // The review/publish steps only need the project approved.
      status: "SCRIPT_APPROVED",
      approvedAt: new Date(),
      idea: firstLine.trim().slice(0, 200),
      product,
      channel: "organico",
      directScript: script,
      directContext: videoContext,
      durationSeconds,
      modelProduct,
      subtitles: parsed.data.subtitles,
      model: DEFAULT_VIDEO_TEXT_MODEL,
      createdById: context.userId,
    },
  });
  await enqueueDirectJob(project.id);
  return NextResponse.json({ success: true, data: { id: project.id } });
}
