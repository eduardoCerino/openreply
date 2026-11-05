import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ id: string }> };

/** Approving the script is the gate for the next phase (frames, then clips). */
export async function POST(_request: NextRequest, ctx: RouteProps) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { id } = await ctx.params;
  const approved = await prisma.videoProject.updateMany({
    where: { id, status: "SCRIPT_READY" },
    data: { status: "SCRIPT_APPROVED", approvedAt: new Date() },
  });
  if (approved.count === 0) {
    return NextResponse.json(
      { success: false, error: "Solo se puede aprobar un guion listo para revisar" },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
}
