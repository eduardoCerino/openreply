import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

// Public on purpose: Shopify downloads the cover from here when the article is
// created. Ids are unguessable cuids and covers hold no private data.
export async function GET(_request: NextRequest, ctx: RouteProps) {
  const { id } = await ctx.params;
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { imageData: true, imageMimeType: true },
  });
  if (!post?.imageData) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(post.imageData), {
    headers: {
      "Content-Type": post.imageMimeType ?? "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
