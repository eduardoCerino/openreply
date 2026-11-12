import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

/** The workspace's connected Facebook Pages. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const pages = await prisma.facebookPage.findMany({
    where: { workspaceId: context.workspaceId },
    select: {
      id: true,
      pageId: true,
      name: true,
      webhookSubscribed: true,
      connectedAt: true,
      instagramAccount: { select: { id: true, username: true } },
    },
    orderBy: { connectedAt: "asc" },
  });
  return NextResponse.json({ success: true, data: pages });
}

/** Disconnects one Page: ?id=<FacebookPage id>. */
export async function DELETE(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const removed = await prisma.facebookPage.deleteMany({ where: { id, workspaceId: context.workspaceId } });
  if (!removed.count) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
