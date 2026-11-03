import { z } from "zod";
import queueFile from "@/content/blog-queue.json";

// content/blog-queue.json is the editable source of the daily job. It is
// imported (not read from disk) so the web bundle and the worker image both
// carry it without extra file tracing; edits ship with the next deploy.

const handlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const queueItemSchema = z.object({
  id: z.string().regex(handlePattern, "id must be a lowercase slug"),
  order: z.number(),
  publishOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  enabled: z.boolean().default(true),
  keyword: z.string().min(2),
  secondaryKeywords: z.array(z.string()).default([]),
  title: z.string().min(5),
  angle: z.string().default(""),
  intent: z.enum(["informativa", "comercial"]),
  product: z.enum(["inositol", "creatina", "none"]),
  tags: z.array(z.string()).default([]),
  productUrl: z.string().nullable().optional(),
  generateImage: z.boolean().default(true),
});

export type BlogQueueItem = z.infer<typeof queueItemSchema>;

const queueSchema = z.object({ items: z.array(queueItemSchema) });

let cached: BlogQueueItem[] | null = null;

export function loadBlogQueue(): BlogQueueItem[] {
  if (cached) return cached;
  const parsed = queueSchema.safeParse(queueFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `content/blog-queue.json is invalid at ${issue?.path.join(".")}: ${issue?.message}`
    );
  }
  const ids = new Set<string>();
  for (const item of parsed.data.items) {
    if (ids.has(item.id)) {
      throw new Error(`content/blog-queue.json has a duplicate id: ${item.id}`);
    }
    ids.add(item.id);
  }
  cached = [...parsed.data.items].sort((a, b) => a.order - b.order);
  return cached;
}

/** YYYY-MM-DD in the blog's timezone, for comparing with publishOn. */
export function todayInTimezone(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Entries still to publish, in order: enabled, due today or earlier, and not
 * already consumed. `consumed` holds the ids with a PUBLISHED/SKIPPED state, and
 * `exhausted` the FAILED ids that ran out of attempts.
 */
export function pendingQueueItems(
  items: BlogQueueItem[],
  consumed: Set<string>,
  today: string
): BlogQueueItem[] {
  return items.filter(
    (item) =>
      item.enabled &&
      !consumed.has(item.id) &&
      (!item.publishOn || item.publishOn <= today)
  );
}
