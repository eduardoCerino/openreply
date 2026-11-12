import { prisma } from "@/lib/db/client";
import { getDMQueue, MESSAGE_JOB_NAME, POSTBACK_JOB_NAME } from "@/lib/queue/client";
import {
  parseFacebookCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
  parseReadEvents,
} from "@/lib/meta/webhook";
import { instagramMediaIdsForFacebookPost } from "@/lib/video/publish";
import { Prisma } from "@/app/generated/prisma/client";

const OPENING_DM_READ_FALLBACK_DELAY_MS = 5 * 60 * 1000;
type PagePayload = Parameters<typeof parseFacebookCommentEvents>[0];

/**
 * Facebook Page webhooks ("page" object): Page comments and Messenger events.
 * They run the campaigns of the Instagram account the Page is linked to, so
 * every job carries that account (as the Instagram jobs do) plus the Page id,
 * which makes the worker answer through Messenger with the Page token.
 */
export async function processFacebookWebhook(incoming: PagePayload) {
  if (incoming.object !== "page" || !Array.isArray(incoming.entry)) return;
  const pages = await prisma.facebookPage.findMany({
    where: { pageId: { in: incoming.entry.map((entry) => entry.id) }, instagramAccountId: { not: null } },
    select: {
      pageId: true,
      workspaceId: true,
      instagramAccount: { select: { id: true, instagramId: true } },
    },
  });
  const pageMap = new Map(pages.filter((page) => page.instagramAccount).map((page) => [page.pageId, page]));
  const payload = { ...incoming, entry: incoming.entry.filter((entry) => pageMap.has(entry.id)) };
  if (!payload.entry.length) return;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object: "page",
      payload: payload as unknown as Prisma.InputJsonValue,
      workspaceId: pages[0]?.workspaceId,
      status: "PENDING",
    },
  });

  try {
    const queue = getDMQueue();
    const channel = (pageId: string) => {
      const page = pageMap.get(pageId)!;
      return {
        instagramAccountId: page.instagramAccount!.instagramId,
        accountConnectionId: page.instagramAccount!.id,
        facebookPageId: pageId,
      };
    };

    for (const event of parseFacebookCommentEvents(payload)) {
      await queue.add(
        "process-comment",
        {
          ...channel(event.pageId),
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          mediaId: event.postId,
          matchPostIds: await instagramMediaIdsForFacebookPost(event.postId),
          source: "WEBHOOK",
        },
        { jobId: `fb_comment_${event.pageId}_${event.commentId}` }
      );
    }

    for (const event of parsePostbackEvents(payload)) {
      await queue.add(
        POSTBACK_JOB_NAME,
        {
          ...channel(event.instagramAccountId),
          userId: event.userId,
          payload: event.payload,
          mid: event.mid,
        },
        {
          jobId: `fb_postback_${event.instagramAccountId}_${event.userId}_${(event.mid ?? event.payload).replace(/:/g, "_")}`,
        }
      );
    }

    for (const event of parseMessageEvents(payload)) {
      await queue.add(
        MESSAGE_JOB_NAME,
        {
          ...channel(event.instagramAccountId),
          messageId: event.messageId,
          messageText: event.messageText,
          senderId: event.senderId,
        },
        { jobId: `fb_message_${event.instagramAccountId}_${Buffer.from(event.messageId).toString("base64url")}` }
      );
    }

    // Read receipt on an opening DM without a tap: deliver the next step after
    // the same grace period as on Instagram.
    for (const event of parseReadEvents(payload)) {
      const target = channel(event.instagramAccountId);
      const openingLogs = await prisma.dmLog.findMany({
        where: {
          commenterId: event.userId,
          status: "SENT",
          automation: { isActive: true, openingDmEnabled: true, facebookEnabled: true, instagramAccountId: target.accountConnectionId },
        },
        select: { automationId: true },
        distinct: ["automationId"],
      });
      for (const log of openingLogs) {
        await queue.add(
          POSTBACK_JOB_NAME,
          { ...target, userId: event.userId, payload: `reveal:${log.automationId}`, fallback: true },
          {
            delay: OPENING_DM_READ_FALLBACK_DELAY_MS,
            jobId: `fb_read_fallback_${event.instagramAccountId}_${event.userId}_${log.automationId}`,
          }
        );
      }
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}
