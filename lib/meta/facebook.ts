import { getMetaGraphApiVersion } from "@/lib/env";
import { handleResponse, type LinkButton } from "@/lib/meta/client";

// Facebook Page side of the Graph API, always on graph.facebook.com with a
// Page token: Messenger private replies to Page comments, Messenger DMs,
// comment replies, the Page's webhook subscription and Facebook Reels.

function graphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

type MessengerButton =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

type Recipient = { comment_id: string } | { id: string };

async function sendMessengerMessage(
  accessToken: string,
  pageId: string,
  recipient: Recipient,
  message: { text: string } | { attachment: unknown }
): Promise<{ recipient_id: string; message_id: string }> {
  const response = await fetch(`${graphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      recipient,
      // A private reply to a comment needs no messaging_type; a DM answers a
      // message the person just sent, inside the 24-hour window.
      ...("id" in recipient ? { messaging_type: "RESPONSE" } : {}),
      message,
    }),
  });
  return handleResponse(response);
}

/** Messenger button template: text up to 640 chars, at most 3 buttons. */
export function buttonTemplate(text: string, buttons: MessengerButton[]) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: buttons.slice(0, 3).map((button) => ({ ...button, title: button.title.slice(0, 20) })),
      },
    },
  };
}

function linkButtons(buttons: LinkButton[]): MessengerButton[] {
  return buttons.map(({ title, url }) => ({ type: "web_url", title, url }));
}

export function sendFacebookText(accessToken: string, pageId: string, recipient: Recipient, text: string) {
  return sendMessengerMessage(accessToken, pageId, recipient, { text: text.slice(0, 2000) });
}

export function sendFacebookPostbackButton(
  accessToken: string,
  pageId: string,
  recipient: Recipient,
  text: string,
  buttonTitle: string,
  payload: string
) {
  return sendMessengerMessage(
    accessToken,
    pageId,
    recipient,
    buttonTemplate(text, [{ type: "postback", title: buttonTitle, payload }])
  );
}

export function sendFacebookLinkButtons(
  accessToken: string,
  pageId: string,
  recipient: Recipient,
  text: string,
  buttons: LinkButton[]
) {
  return sendMessengerMessage(accessToken, pageId, recipient, buttonTemplate(text, linkButtons(buttons)));
}

/** Public reply under a Page post comment. */
export async function sendFacebookCommentReply(accessToken: string, commentId: string, message: string) {
  const body = new URLSearchParams({ message });
  const response = await fetch(`${graphBase()}/${commentId}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  return handleResponse<{ id: string }>(response);
}

/** First name of a Messenger user (PSID), for {username}. */
export async function getFacebookUserName(accessToken: string, psid: string): Promise<string | null> {
  try {
    const url = new URL(`${graphBase()}/${psid}`);
    url.searchParams.set("fields", "first_name,name");
    url.searchParams.set("access_token", accessToken);
    const data = await handleResponse<{ first_name?: string; name?: string }>(await fetch(url.toString()));
    return data.first_name ?? data.name ?? null;
  } catch {
    return null;
  }
}

export const PAGE_WEBHOOK_FIELDS = ["feed", "messages", "messaging_postbacks", "message_reads"];

/** Installs the app on the Page so its comments and Messenger events arrive. */
export async function subscribePageToWebhooks(pageId: string, accessToken: string) {
  const url = new URL(`${graphBase()}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", PAGE_WEBHOOK_FIELDS.join(","));
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return handleResponse<{ success: boolean }>(response);
}

// ── Facebook Reels ──────────────────────────────────────────────────────────
// start → upload (rupload, hosted file_url) → finish with video_state
// PUBLISHED → poll the video's status until it is ready.

export async function startReelUpload(accessToken: string, pageId: string) {
  const response = await fetch(`${graphBase()}/${pageId}/video_reels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ upload_phase: "start" }),
  });
  const data = await handleResponse<{ video_id: string; upload_url?: string }>(response);
  return {
    videoId: data.video_id,
    uploadUrl: data.upload_url ?? `https://rupload.facebook.com/video-upload/${getMetaGraphApiVersion()}/${data.video_id}`,
  };
}

export async function uploadReelFromUrl(accessToken: string, uploadUrl: string, fileUrl: string) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_url: fileUrl },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(`Facebook upload ${response.status}: ${data?.debug_info?.message ?? data?.error?.message ?? JSON.stringify(data)}`);
  }
}

export async function finishReelUpload(accessToken: string, pageId: string, videoId: string, description: string) {
  const response = await fetch(`${graphBase()}/${pageId}/video_reels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description }),
  });
  return handleResponse<{ success: boolean; post_id?: string }>(response);
}

export interface FacebookVideoStatus {
  videoStatus?: string;
  publishStatus?: string;
  error?: string;
  postId?: string;
  permalink?: string;
}

export async function getVideoStatus(accessToken: string, videoId: string): Promise<FacebookVideoStatus> {
  const url = new URL(`${graphBase()}/${videoId}`);
  url.searchParams.set("fields", "status,permalink_url,post_id");
  url.searchParams.set("access_token", accessToken);
  const data = await handleResponse<{
    status?: {
      video_status?: string;
      processing_phase?: { status?: string; error?: { message?: string } };
      publishing_phase?: { status?: string; error?: { message?: string } };
    };
    permalink_url?: string;
    post_id?: string;
  }>(await fetch(url.toString()));
  const permalink = data.permalink_url
    ? data.permalink_url.startsWith("http")
      ? data.permalink_url
      : `https://www.facebook.com${data.permalink_url}`
    : undefined;
  return {
    videoStatus: data.status?.video_status,
    publishStatus: data.status?.publishing_phase?.status,
    error: data.status?.processing_phase?.error?.message ?? data.status?.publishing_phase?.error?.message,
    postId: data.post_id,
    permalink,
  };
}
