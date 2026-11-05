import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

// Private: clips show a real person. Serves byte ranges so Safari can play it.
export async function GET(request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const clip = await prisma.videoClip.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!clip?.data) return new Response("Not found", { status: 404 });

  const body = Buffer.from(clip.data);
  const type = clip.mimeType ?? "video/mp4";
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return new Response(body.subarray(start, end + 1), {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${body.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
