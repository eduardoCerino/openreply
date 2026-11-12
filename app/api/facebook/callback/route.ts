import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { subscribePageToWebhooks } from "@/lib/meta/facebook";
import { encryptToken, exchangeCodeForPages, verifyOAuthState } from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const code = request.nextUrl.searchParams.get("code");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  if (request.nextUrl.searchParams.get("error")) return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${baseUrl}/login`);
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: state.workspaceId, userId: session.user.id },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
  }

  try {
    const pages = await exchangeCodeForPages(code, `${baseUrl}/api/facebook/callback`);
    if (pages.length === 0) throw new Error("No se concedió ninguna Página de Facebook");

    const accounts = await prisma.instagramAccount.findMany({
      where: { workspaceId: state.workspaceId },
      select: { id: true, instagramId: true },
    });
    let connected = 0;
    for (const page of pages) {
      const existing = await prisma.facebookPage.findUnique({ where: { pageId: page.pageId } });
      if (existing && existing.workspaceId !== state.workspaceId) continue;
      // The Page's linked Instagram account runs its campaigns. With a single
      // Instagram account in the workspace, that one is used.
      const linked =
        accounts.find((account) => account.instagramId === page.instagramId) ??
        (accounts.length === 1 ? accounts[0] : undefined);

      let webhookSubscribed = false;
      try {
        await subscribePageToWebhooks(page.pageId, page.pageAccessToken);
        webhookSubscribed = true;
      } catch (error) {
        console.warn("[Facebook Callback] Page webhook subscription failed:", error);
      }
      const data = {
        name: page.name,
        accessToken: encryptToken(page.pageAccessToken),
        instagramAccountId: linked?.id ?? null,
        webhookSubscribed,
      };
      await prisma.facebookPage.upsert({
        where: { pageId: page.pageId },
        create: { ...data, pageId: page.pageId, workspaceId: state.workspaceId },
        update: data,
      });
      connected++;
    }
    if (connected === 0) throw new Error("Esas Páginas ya están conectadas en otro espacio de trabajo");
    return NextResponse.redirect(`${baseUrl}/settings?facebook=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Facebook Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Facebook connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});
    return NextResponse.redirect(`${baseUrl}/settings?facebook=failed&reason=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
