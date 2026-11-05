import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ product: string; kind: string }> };

// Private: these are photos of real people, only for the panel's admins.
export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { product, kind } = await ctx.params;
  const row = await prisma.videoReference.findUnique({ where: { product_kind: { product, kind } } });
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(row.data), {
    headers: { "Content-Type": row.mimeType, "Cache-Control": "private, no-store" },
  });
}

export async function DELETE(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { product, kind } = await ctx.params;
  await prisma.videoReference.deleteMany({ where: { product, kind } });
  return NextResponse.json({ success: true });
}
