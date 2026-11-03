import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { GENERATE_JOB, enqueueBlogJob } from "@/lib/blog/jobs";
import { createDraft } from "@/lib/blog/pipeline";
import { getMissingBlogEnv } from "@/lib/blog/config";

export const runtime = "nodejs";

const createSchema = z.object({
  idea: z.string().trim().min(5, "Escribe la idea o tema").max(2000),
  keyword: z.string().trim().max(120).optional(),
  product: z.enum(["inositol", "creatina", "none"]).default("none"),
  intent: z.enum(["informativa", "comercial"]).default("informativa"),
  generateImage: z.boolean().default(false),
});

const listSelect = {
  id: true,
  source: true,
  status: true,
  dryRun: true,
  queueKey: true,
  keyword: true,
  title: true,
  product: true,
  shopifyUrl: true,
  error: true,
  createdAt: true,
  publishedAt: true,
} as const;

export async function GET() {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const posts = await prisma.blogPost.findMany({
    where: { status: { not: "DISCARDED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: listSelect,
  });
  return NextResponse.json({ success: true, data: posts });
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
  const missing = getMissingBlogEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: `Faltan variables de entorno: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const { idea, keyword, product, intent, generateImage } = parsed.data;
  const draft = await createDraft({
    source: "MANUAL",
    idea,
    // Without an explicit keyword the idea itself is the topic the checks use.
    keyword: keyword || idea.slice(0, 120),
    intent,
    product,
    tags: [],
    generateImage,
    createdById: context.userId,
  });
  await enqueueBlogJob({ kind: GENERATE_JOB, postId: draft.id });
  return NextResponse.json({ success: true, data: { id: draft.id } });
}
