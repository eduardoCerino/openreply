import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

// Private: frames show a real person.
export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const frame = await prisma.videoFrame.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!frame?.data) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(frame.data), {
    headers: { "Content-Type": frame.mimeType ?? "image/webp", "Cache-Control": "private, max-age=3600" },
  });
}
