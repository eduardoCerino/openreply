// HTML helpers for generated articles. Model output is treated as untrusted:
// only a small tag allowlist survives, every attribute is dropped and links
// are never taken from the model — the pipeline adds the internal ones itself.

const ALLOWED_TAGS = new Set([
  "h2", "h3", "p", "ul", "ol", "li", "strong", "em", "b", "i",
  "table", "thead", "tbody", "tr", "th", "td", "blockquote", "br",
]);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|svg)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, rawName: string) => {
      const name = rawName.toLowerCase();
      const closing = tag.startsWith("</");
      // The theme renders the article title as the page's only H1.
      const mapped = name === "h1" ? "h2" : name;
      if (!ALLOWED_TAGS.has(mapped)) return "";
      if (mapped === "br") return closing ? "" : "<br>";
      return closing ? `</${mapped}>` : `<${mapped}>`;
    })
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(html: string): number {
  const text = stripTags(html);
  return text ? text.split(" ").length : 0;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "de", "la", "el", "en", "y", "a", "los", "las", "del", "para", "que", "con",
  "por", "un", "una", "se", "su", "al", "es", "lo", "como", "o",
]);

/**
 * Whether `text` covers the keyword. Search keywords are rarely written
 * verbatim ("ovario poliquistico tratamiento"), so this checks that most of the
 * keyword's meaningful words appear, accent- and case-insensitively.
 */
export function containsKeyword(text: string, keyword: string): boolean {
  const haystack = ` ${normalizeText(text)} `;
  const words = normalizeText(keyword)
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  if (words.length === 0) return haystack.includes(normalizeText(keyword));
  const hits = words.filter((word) => haystack.includes(word)).length;
  return hits / words.length >= 0.7;
}

export function slugify(value: string, maxLength = 70): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, "");
}

/** Cut at a word boundary so a title tag or meta never ends mid-word. */
export function truncateAtWord(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : clean.slice(0, max))
    .replace(/[\s,;:.\-–—]+$/, "")
    .trim();
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/^#/, "").trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export interface RelatedLink {
  title: string;
  url: string;
}

export interface AssembleInput {
  directAnswer: string;
  bodyHtml: string;
  faqs: Array<{ question: string; answer: string }>;
  ctaText: string;
  productName: string | null;
  productUrl: string | null;
  related: RelatedLink[];
}

export function assembleArticleHtml(input: AssembleInput): string {
  const parts = [`<p>${escapeHtml(input.directAnswer.trim())}</p>`, input.bodyHtml];

  if (input.productUrl && input.productName && input.ctaText.trim()) {
    parts.push(
      `<p>${escapeHtml(input.ctaText.trim())} <a href="${escapeHtml(input.productUrl)}">Conoce ${escapeHtml(input.productName)}</a>.</p>`
    );
  }

  if (input.related.length > 0) {
    parts.push(
      "<h2>Artículos relacionados</h2>",
      `<ul>${input.related
        .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`)
        .join("")}</ul>`
    );
  }

  if (input.faqs.length > 0) {
    parts.push(
      "<h2>Preguntas frecuentes</h2>",
      ...input.faqs.map(
        (faq) => `<h3>${escapeHtml(faq.question.trim())}</h3><p>${escapeHtml(faq.answer.trim())}</p>`
      )
    );
  }

  return parts.join("\n");
}

export interface QualityCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  /** Hard checks trigger one regeneration in the pipeline. */
  hard?: boolean;
}

export function runQualityChecks({
  keyword,
  title,
  titleTag,
  metaDescription,
  directAnswer,
  bodyHtml,
  finalHtml,
  faqs,
}: {
  keyword: string;
  title: string;
  titleTag: string;
  metaDescription: string;
  directAnswer: string;
  bodyHtml: string;
  finalHtml: string;
  faqs: unknown[];
}): QualityCheck[] {
  const words = countWords(finalHtml);
  const h2s = [...bodyHtml.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((m) => stripTags(m[1]));
  const firstParagraph = bodyHtml.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? "";
  const sentences = directAnswer.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  return [
    { id: "words", label: "900–1200 palabras", ok: words >= 900 && words <= 1250, detail: `${words} palabras`, hard: words < 750 },
    { id: "h1", label: "Keyword en el H1", ok: containsKeyword(title, keyword), hard: true },
    { id: "intro", label: "Keyword en la respuesta directa y primer párrafo", ok: containsKeyword(`${directAnswer} ${firstParagraph}`, keyword) },
    { id: "h2", label: "Keyword en al menos un H2", ok: h2s.some((h2) => containsKeyword(h2, keyword)) },
    { id: "direct", label: "Respuesta directa de 2-4 oraciones", ok: sentences >= 2 && sentences <= 4, detail: `${sentences} oraciones` },
    { id: "faq", label: "3-5 preguntas frecuentes", ok: faqs.length >= 3 && faqs.length <= 5, detail: `${faqs.length}`, hard: faqs.length < 2 },
    { id: "titleTag", label: "Title tag ≤ 60", ok: titleTag.length <= 60, detail: `${titleTag.length}` },
    { id: "meta", label: "Meta description ≤ 155", ok: metaDescription.length <= 155, detail: `${metaDescription.length}` },
    { id: "h2count", label: "Al menos 3 secciones H2", ok: h2s.length >= 3, detail: `${h2s.length}` },
  ];
}
