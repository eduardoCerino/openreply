import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl } from "@/lib/env";
import { createOAuthState, getFacebookPagesAuthorizationUrl } from "@/lib/meta/oauth";

const REQUIRED_ENV = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "ENCRYPTION_KEY", "NEXTAUTH_SECRET"];

/** Starts Facebook Login to connect the Page linked to the Instagram account. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.redirect(`${getBaseUrl()}/login`);
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?facebook=forbidden`);
  }
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.redirect(
      `${getBaseUrl()}/settings?facebook=misconfigured&missing=${encodeURIComponent(missing.join(","))}`
    );
  }
  const redirectUri = `${getBaseUrl()}/api/facebook/callback`;
  return NextResponse.redirect(getFacebookPagesAuthorizationUrl(redirectUri, createOAuthState(context.workspaceId)));
}
