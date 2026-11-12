import { describe, it, expect } from "vitest";
import { parseFacebookCommentEvents, parseMessageEvents, parsePostbackEvents } from "../lib/meta/webhook";
import { buttonTemplate } from "../lib/meta/facebook";

const PAGE_ID = "1111";

function feed(value: Record<string, unknown>) {
  return { object: "page", entry: [{ id: PAGE_ID, time: 1, changes: [{ field: "feed", value }] }] };
}

describe("parseFacebookCommentEvents", () => {
  it("reads a new comment on a Page post", () => {
    const events = parseFacebookCommentEvents(
      feed({
        item: "comment",
        verb: "add",
        comment_id: "222_333",
        post_id: "1111_444",
        message: "CREATINA",
        from: { id: "555", name: "Ana" },
      })
    );
    expect(events).toEqual([
      { pageId: PAGE_ID, commentId: "222_333", commentText: "CREATINA", commenterId: "555", commenterName: "Ana", postId: "1111_444" },
    ]);
  });

  it("skips edits, likes and the Page's own comments", () => {
    expect(parseFacebookCommentEvents(feed({ item: "comment", verb: "edited", comment_id: "1", post_id: "2", from: { id: "5" } }))).toEqual([]);
    expect(parseFacebookCommentEvents(feed({ item: "reaction", verb: "add", post_id: "2", from: { id: "5" } }))).toEqual([]);
    expect(
      parseFacebookCommentEvents(feed({ item: "comment", verb: "add", comment_id: "1", post_id: "2", from: { id: PAGE_ID } }))
    ).toEqual([]);
  });

  it("ignores Instagram payloads", () => {
    expect(parseFacebookCommentEvents({ object: "instagram", entry: [] })).toEqual([]);
  });
});

describe("Messenger events on a Page", () => {
  const messaging = (event: Record<string, unknown>) => ({
    object: "page",
    entry: [{ id: PAGE_ID, time: 1, messaging: [{ sender: { id: "777" }, recipient: { id: PAGE_ID }, ...event }] }],
  });

  it("parses a Messenger DM and a button tap", () => {
    expect(parseMessageEvents(messaging({ message: { mid: "m1", text: "creatina" } }))).toEqual([
      { instagramAccountId: PAGE_ID, messageId: "m1", messageText: "creatina", senderId: "777" },
    ]);
    expect(parsePostbackEvents(messaging({ postback: { mid: "p1", payload: "reveal:abc" } }))).toEqual([
      { instagramAccountId: PAGE_ID, userId: "777", payload: "reveal:abc", mid: "p1" },
    ]);
  });

  it("drops the Page's own echoes", () => {
    expect(parseMessageEvents(messaging({ message: { mid: "m2", text: "hola", is_echo: true } }))).toEqual([]);
  });
});

describe("buttonTemplate", () => {
  it("caps the text, the titles and the number of buttons", () => {
    const template = buttonTemplate("x".repeat(700), [
      { type: "web_url", title: "Ver el producto ahora mismo", url: "https://a.test" },
      { type: "web_url", title: "b", url: "https://b.test" },
      { type: "web_url", title: "c", url: "https://c.test" },
      { type: "web_url", title: "d", url: "https://d.test" },
    ]);
    const payload = template.attachment.payload;
    expect(payload.text).toHaveLength(640);
    expect(payload.buttons).toHaveLength(3);
    expect(payload.buttons[0].title).toHaveLength(20);
  });
});
