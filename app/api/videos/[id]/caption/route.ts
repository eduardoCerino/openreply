import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { generateVideoCaption } from "@/lib/video/caption";
import type { VideoScript } from "@/lib/video/prompt";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/**
 * Writes the Reel caption and hashtags with AI from what the video says.
 * Direct videos keep it in their plan so the publish panel shows it again;
 * the reviewer can still edit it before publishing.
 */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ success: false, error: "Falta OPENAI_API_KEY" }, { status: 400 });
  }
  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const script =
    project.mode === "directo"
      ? project.directScript
      : (() => {
          const value = project.script as VideoScript | null;
          if (!value?.scenes) return null;
          return [value.hook, ...value.scenes.map((scene) => scene.voiceover), value.cta].filter(Boolean).join("\n");
        })();
  if (!script?.trim()) {
    return NextResponse.json({ success: false, error: "El video no tiene guion" }, { status: 409 });
  }

  try {
    const generated = await generateVideoCaption({
      script,
      context: project.mode === "directo" ? project.directContext : project.idea,
      product: project.product,
      model: project.model,
    });
    if (project.mode === "directo" && project.directPlan) {
      const plan = project.directPlan as Record<string, unknown>;
      await prisma.videoProject.update({
        where: { id },
        data: {
          directPlan: { ...plan, caption: generated.caption, hashtags: generated.hashtags } as Prisma.InputJsonValue,
        },
      });
    }
    return NextResponse.json({ success: true, data: { caption: generated.text } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "No se pudo generar el caption" },
      { status: 502 }
    );
  }
}
