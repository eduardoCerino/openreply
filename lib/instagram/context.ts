import { decryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

export type InstagramContext =
  | { provider: "META"; accessToken: string }
  // A Facebook Page reached through the Instagram account's campaigns: the
  // Page token, and Messenger instead of Instagram DMs.
  | { provider: "FACEBOOK"; accessToken: string; pageId: string }
  | {
      provider: "ZERNIO";
      apiKey: string;
      accountId: string;
      instagramId: string;
      operationId?: string;
    };

export type ProviderAccount = {
  provider: "META" | "ZERNIO";
  workspaceId: string;
  zernioAccountId: string | null;
  instagramId: string;
  accessToken: string;
};

export function hasInstagramCredentials(
  account: Pick<ProviderAccount, "provider" | "accessToken" | "zernioAccountId">
) {
  return account.provider === "ZERNIO"
    ? Boolean(account.zernioAccountId)
    : Boolean(account.accessToken);
}

export async function createInstagramContext(
  account: ProviderAccount,
  operationId?: string
): Promise<InstagramContext> {
  if (account.provider !== "ZERNIO")
    return { provider: "META", accessToken: decryptToken(account.accessToken) };
  if (!account.zernioAccountId)
    throw new Error("Zernio account is not connected");
  const connection = await prisma.zernioConnection.findUnique({
    where: { workspaceId: account.workspaceId },
    select: { apiKey: true },
  });
  if (!connection) throw new Error("Zernio workspace connection is missing");
  return {
    provider: "ZERNIO",
    apiKey: decryptToken(connection.apiKey),
    accountId: account.zernioAccountId,
    instagramId: account.instagramId,
    ...(operationId ? { operationId } : {}),
  };
}

export type ZernioContext = Extract<InstagramContext, { provider: "ZERNIO" }>;
export type FacebookContext = Extract<InstagramContext, { provider: "FACEBOOK" }>;

/** Context for a connected Facebook Page, by its Page id. */
export async function createFacebookContext(pageId: string): Promise<FacebookContext> {
  const page = await prisma.facebookPage.findUnique({ where: { pageId }, select: { accessToken: true } });
  if (!page) throw new Error("Facebook Page is not connected");
  return { provider: "FACEBOOK", accessToken: decryptToken(page.accessToken), pageId };
}

/** A read that only exists for Instagram, called with a Facebook Page context. */
export function facebookUnsupported(action: string): Error {
  return new Error(`${action} is not available for Facebook Pages`);
}
