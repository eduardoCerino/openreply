import { Prisma, type BlogPost, type BlogRunTrigger } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import {
  PRODUCTS,
  articleUrl,
  getBlogConfig,
  productUrl,
  type BlogProduct,
} from "@/lib/blog/config";
import {
  assembleArticleHtml,
  normalizeTags,
  runQualityChecks,
  sanitizeArticleHtml,
  slugify,
  truncateAtWord,
  type QualityCheck,
  type RelatedLink,
} from "@/lib/blog/html";
import { buildCoverPrompt, isImageStyle, pickImageStyle, type ImageStyle } from "@/lib/blog/image-style";
import { buildArticleJsonLd, renderJsonLdScript } from "@/lib/blog/json-ld";
import { generateCoverImage, generateStructured } from "@/lib/blog/openai";
import {
  ARTICLE_SCHEMA,
  buildInput,
  buildInstructions,
  type ArticleBrief,
  type GeneratedArticle,
} from "@/lib/blog/prompt";
import { loadBlogQueue, pendingQueueItems, todayInTimezone } from "@/lib/blog/queue";
import {
  createArticle,
  findArticleByHandle,
  listArticlesByTag,
  updateArticleBody,
} from "@/lib/blog/shopify";

const MAX_QUEUE_ATTEMPTS = 3;
const PRODUCT_TAGS = new Set(Object.values(PRODUCTS).map((p) => p.tag));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface DraftInput {
  source: "QUEUE" | "MANUAL";
  dryRun?: boolean;
  queueKey?: string;
  idea?: string;
  keyword: string;
  secondaryKeywords?: string[];
  title?: string;
  angle?: string;
  intent: "informativa" | "comercial";
  product: BlogProduct;
  tags?: string[];
  handle?: string;
  generateImage: boolean;
  createdById?: string;
}

// The brief fields that are not columns travel in `checks` until generation
// replaces them with the quality checks.
interface PendingBrief {
  pendingBrief: { title?: string; angle?: string };
}

export async function createDraft(input: DraftInput): Promise<BlogPost> {
  return prisma.blogPost.create({
    data: {
      source: input.source,
      dryRun: input.dryRun ?? false,
      queueKey: input.queueKey,
      idea: input.idea,
      keyword: input.keyword.trim(),
      secondaryKeywords: input.secondaryKeywords ?? [],
      intent: input.intent,
      product: input.product,
      tags: input.tags ?? [],
      handle: input.handle,
      generateImage: input.generateImage,
      createdById: input.createdById,
      checks: { pendingBrief: { title: input.title, angle: input.angle } } satisfies PendingBrief,
    },
  });
}

/** Tags for Shopify: the product tag first (the theme's CTA keys off it). */
export function resolveTags(product: BlogProduct, ...lists: string[][]): string[] {
  const productTag = product === "none" ? null : PRODUCTS[product].tag;
  const tags = normalizeTags([...(productTag ? [productTag] : []), ...lists.flat()]).filter(
    // A stray "creatina" tag on an inositol article would show the wrong CTA.
    (tag) => !PRODUCT_TAGS.has(tag as "inositol" | "creatina") || tag === productTag
  );
  return tags.slice(0, 8);
}

async function relatedLinks(product: BlogProduct, tags: string[], excludeHandle?: string) {
  const tag = product === "none" ? tags[0] : PRODUCTS[product].tag;
  if (!tag) return [];
  try {
    const articles = await listArticlesByTag(tag, 10);
    return articles
      .filter((article) => article.handle !== excludeHandle)
      .slice(0, 3)
      .map<RelatedLink>((article) => ({ title: article.title, url: articleUrl(article.handle) }));
  } catch (error) {
    // Related links are a nice-to-have; a Shopify hiccup must not block writing.
    console.warn("[Blog] Related articles unavailable:", errorMessage(error));
    return [];
  }
}

/**
 * Style of the most recent cover, for the anti-repetition rule: the next
 * cover avoids its surface and angle. Discarded drafts still count, since
 * they were the last thing seen.
 */
async function lastImageStyle(excludeId: string): Promise<ImageStyle | null> {
  const previous = await prisma.blogPost.findFirst({
    where: { id: { not: excludeId }, imageStyle: { not: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    select: { imageStyle: true },
  });
  return isImageStyle(previous?.imageStyle) ? previous.imageStyle : null;
}

async function uniqueHandle(base: string, fixed: boolean): Promise<string> {
  if (fixed) return base;
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken =
      (await findArticleByHandle(candidate).catch(() => null)) ||
      (await prisma.blogPost.findFirst({
        where: { handle: candidate, status: { in: ["READY", "PUBLISHING", "PUBLISHED"] } },
        select: { id: true },
      }));
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function writeArticle(brief: ArticleBrief) {
  const instructions = buildInstructions();
  let feedback: string | undefined;
  let last: { article: GeneratedArticle; model: string; checks: QualityCheck[]; bodyHtml: string } | null = null;

  // One regeneration when a hard check fails (too short, keyword missing from
  // the H1, no FAQ); after that the draft is kept and the checks show why.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { value: article, model } = await generateStructured<GeneratedArticle>({
      name: "blog_article",
      schema: ARTICLE_SCHEMA as unknown as Record<string, unknown>,
      instructions,
      input: buildInput(brief, feedback),
    });
    const bodyHtml = sanitizeArticleHtml(article.bodyHtml);
    const previewHtml = assembleArticleHtml({
      directAnswer: article.directAnswer,
      bodyHtml,
      faqs: article.faqs,
      ctaText: article.ctaText,
      productName: null,
      productUrl: null,
      related: [],
    });
    const checks = runQualityChecks({
      keyword: brief.keyword,
      title: article.title,
      titleTag: truncateAtWord(article.titleTag, 60),
      metaDescription: truncateAtWord(article.metaDescription, 155),
      directAnswer: article.directAnswer,
      bodyHtml,
      finalHtml: previewHtml,
      faqs: article.faqs,
    });
    last = { article, model, checks, bodyHtml };
    const failedHard = checks.filter((check) => check.hard && !check.ok);
    if (failedHard.length === 0) break;
    feedback = failedHard.map((check) => `${check.label} (${check.detail ?? "no cumple"})`).join("; ");
  }
  return last!;
}

/** Writes the article (and cover) for a GENERATING post and marks it READY. */
export async function generateDraft(postId: string): Promise<BlogPost> {
  const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });
  const pending = (post.checks as PendingBrief | null)?.pendingBrief ?? {};
  const product = post.product as BlogProduct;

  try {
    const brief: ArticleBrief = {
      keyword: post.keyword,
      secondaryKeywords: post.secondaryKeywords,
      title: pending.title,
      angle: pending.angle,
      idea: post.idea ?? undefined,
      intent: post.intent as ArticleBrief["intent"],
      product,
      tags: post.tags,
    };
    const { article, model, checks, bodyHtml } = await writeArticle(brief);

    const handle = await uniqueHandle(
      post.handle ?? slugify(article.slug || post.keyword),
      Boolean(post.handle)
    );
    const tags = resolveTags(product, post.tags, article.tags);
    const related = await relatedLinks(product, tags, handle);
    const html = assembleArticleHtml({
      directAnswer: article.directAnswer,
      bodyHtml,
      faqs: article.faqs,
      ctaText: article.ctaText,
      productName: product === "none" ? null : PRODUCTS[product].shortName,
      productUrl: productUrl(product),
      related,
    });

    let image: { data: Buffer; mimeType: string } | null = null;
    let imageStyle: ImageStyle | null = null;
    const allChecks: QualityCheck[] = [
      ...checks,
      {
        id: "related",
        label: "Enlaces a artículos relacionados",
        ok: related.length >= 2,
        detail: related.length ? `${related.length}` : "aún no hay artículos con este tag",
      },
    ];
    if (post.generateImage) {
      try {
        imageStyle = pickImageStyle(await lastImageStyle(post.id));
        image = await generateCoverImage(buildCoverPrompt(article.imagePrompt, imageStyle));
        allChecks.push({
          id: "image",
          label: "Imagen de portada",
          ok: true,
          detail: `${Math.round(image.data.length / 1024)} KB · ${imageStyle.surface}, ${imageStyle.angle}`,
        });
      } catch (error) {
        // Publish without a cover rather than lose the article. The style was
        // never seen, so it does not count for the anti-repetition rule.
        imageStyle = null;
        allChecks.push({ id: "image", label: "Imagen de portada", ok: false, detail: errorMessage(error) });
      }
    }

    return await prisma.blogPost.update({
      where: { id: post.id },
      data: {
        status: "READY",
        title: article.title.trim(),
        titleTag: truncateAtWord(article.titleTag, 60),
        metaDescription: truncateAtWord(article.metaDescription, 155),
        handle,
        summary: article.summary.trim(),
        bodyHtml: html,
        tags,
        faqs: article.faqs,
        checks: allChecks as unknown as object,
        imageAlt: truncateAtWord(article.imageAlt, 125),
        imageStyle: imageStyle ? (imageStyle as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        imageData: image ? new Uint8Array(image.data) : null,
        imageMimeType: image?.mimeType ?? null,
        model,
        error: null,
      },
    });
  } catch (error) {
    return prisma.blogPost.update({
      where: { id: post.id },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

/** Publishes a READY post to Shopify. Only one caller can win the READY→PUBLISHING claim. */
export async function publishPost(postId: string): Promise<BlogPost> {
  const claimed = await prisma.blogPost.updateMany({
    where: { id: postId, status: "READY" },
    data: { status: "PUBLISHING", error: null },
  });
  if (claimed.count === 0) {
    return prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });
  }
  const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });

  try {
    if (!post.handle || !post.title || !post.bodyHtml) {
      throw new Error("The draft is incomplete; regenerate it");
    }
    const existing = await findArticleByHandle(post.handle);
    if (existing) {
      throw new Error(`An article with the handle "${post.handle}" already exists in Shopify`);
    }

    const created = await createArticle({
      title: post.title,
      handle: post.handle,
      bodyHtml: post.bodyHtml,
      summary: post.summary ?? "",
      tags: post.tags,
      titleTag: post.titleTag ?? post.title,
      metaDescription: post.metaDescription ?? "",
      ...(post.imageData
        ? { imageUrl: `${getBaseUrl()}/api/blog/images/${post.id}`, imageAlt: post.imageAlt ?? post.keyword }
        : {}),
    });

    // JSON-LD needs the final URL, date and Shopify-hosted image, which only
    // exist after creation, so it is added with a second write.
    const url = articleUrl(created.handle);
    const publishedAt = created.publishedAt ?? new Date().toISOString();
    const jsonLd = buildArticleJsonLd({
      title: post.title,
      description: post.metaDescription ?? post.summary ?? "",
      url,
      imageUrl: created.image?.url ?? null,
      datePublished: publishedAt,
      dateModified: publishedAt,
      keywords: [post.keyword, ...post.secondaryKeywords],
      faqs: (post.faqs as Array<{ question: string; answer: string }> | null) ?? [],
    });
    let jsonLdError: string | null = null;
    try {
      await updateArticleBody(created.id, `${post.bodyHtml}\n${renderJsonLdScript(jsonLd)}`);
    } catch (error) {
      jsonLdError = `Publicado sin JSON-LD: ${errorMessage(error)}`;
    }

    const updated = await prisma.blogPost.update({
      where: { id: post.id },
      data: {
        status: "PUBLISHED",
        shopifyArticleId: created.id,
        shopifyUrl: url,
        handle: created.handle,
        publishedAt: new Date(publishedAt),
        error: jsonLdError,
      },
    });
    if (post.queueKey) {
      await prisma.blogQueueState.upsert({
        where: { queueKey: post.queueKey },
        create: { queueKey: post.queueKey, status: "PUBLISHED", attempts: 1, postId: post.id },
        update: { status: "PUBLISHED", postId: post.id, lastError: null },
      });
    }
    return updated;
  } catch (error) {
    // Back to READY so the panel can retry; the reason is kept on the draft.
    return prisma.blogPost.update({
      where: { id: post.id },
      data: { status: "READY", error: errorMessage(error).slice(0, 2000) },
    });
  }
}

export interface DailyRunOptions {
  trigger: BlogRunTrigger;
  dryRun: boolean;
  /** Skip the once-a-day guard (manual "publish next now"). */
  force?: boolean;
}

export async function runDailyJob({ trigger, dryRun, force = false }: DailyRunOptions) {
  const run = await prisma.blogRun.create({ data: { trigger, dryRun } });
  const finish = (status: "SUCCEEDED" | "SKIPPED" | "FAILED", message: string, extra: { queueKey?: string; postId?: string } = {}) =>
    prisma.blogRun.update({
      where: { id: run.id },
      data: { status, message: message.slice(0, 2000), finishedAt: new Date(), ...extra },
    });

  let queueKey: string | undefined;
  try {
    if (!dryRun && !force) {
      const recent = await prisma.blogRun.findFirst({
        where: {
          id: { not: run.id },
          dryRun: false,
          status: "SUCCEEDED",
          startedAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
        },
      });
      if (recent) return finish("SKIPPED", "Ya se publicó un artículo en las últimas 20 horas");
    }

    const states = await prisma.blogQueueState.findMany();
    const consumed = new Set(
      states
        .filter((s) => s.status !== "FAILED" || s.attempts >= MAX_QUEUE_ATTEMPTS)
        .map((s) => s.queueKey)
    );
    const today = todayInTimezone(getBlogConfig().timezone);
    const pending = pendingQueueItems(loadBlogQueue(), consumed, today);

    // Topics already live in Shopify (published by hand or before this job
    // existed) are marked SKIPPED, so the job moves on instead of duplicating.
    let item = null;
    for (const candidate of pending.slice(0, 15)) {
      const existing = await findArticleByHandle(candidate.id);
      if (!existing) {
        item = candidate;
        break;
      }
      await prisma.blogQueueState.upsert({
        where: { queueKey: candidate.id },
        create: { queueKey: candidate.id, status: "SKIPPED", lastError: "Ya existe en Shopify" },
        update: { status: "SKIPPED", lastError: "Ya existe en Shopify" },
      });
    }
    if (!item) return finish("SKIPPED", "No hay temas pendientes en la cola");
    queueKey = item.id;

    const draft = await createDraft({
      source: "QUEUE",
      dryRun,
      queueKey: item.id,
      keyword: item.keyword,
      secondaryKeywords: item.secondaryKeywords,
      title: item.title,
      angle: item.angle,
      intent: item.intent,
      product: item.product,
      tags: item.tags,
      handle: item.id,
      generateImage: item.generateImage,
    });
    const generated = await generateDraft(draft.id);
    if (generated.status !== "READY") throw new Error(generated.error ?? "Generation failed");

    if (dryRun) {
      return finish("SUCCEEDED", `Dry-run: borrador "${generated.title}" listo (no publicado)`, {
        queueKey,
        postId: generated.id,
      });
    }

    const published = await publishPost(generated.id);
    if (published.status !== "PUBLISHED") throw new Error(published.error ?? "Publish failed");
    return finish("SUCCEEDED", `Publicado: ${published.shopifyUrl}`, { queueKey, postId: published.id });
  } catch (error) {
    const message = errorMessage(error);
    if (queueKey && !dryRun) {
      await prisma.blogQueueState.upsert({
        where: { queueKey },
        create: { queueKey, status: "FAILED", attempts: 1, lastError: message.slice(0, 2000) },
        update: { status: "FAILED", attempts: { increment: 1 }, lastError: message.slice(0, 2000) },
      });
    }
    console.error("[Blog] Daily run failed:", message);
    return finish("FAILED", message, { queueKey });
  }
}
