import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

/** Blog routes publish to the store, so they need a workspace owner/admin. */
export async function requireBlogAdmin() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canManageWorkspace(context.role)) {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { context };
}
