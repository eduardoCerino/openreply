import { describe, it, expect } from "vitest";
import {
  assembleArticleHtml,
  containsKeyword,
  countWords,
  sanitizeArticleHtml,
  slugify,
  truncateAtWord,
} from "../lib/blog/html";
import { buildArticleJsonLd, renderJsonLdScript } from "../lib/blog/json-ld";
import {
  IMAGE_ANGLES,
  IMAGE_CONSTANTS,
  IMAGE_PROPS,
  IMAGE_SURFACES,
  buildCoverPrompt,
  isImageStyle,
  pickImageStyle,
} from "../lib/blog/image-style";
import { loadBlogQueue, pendingQueueItems, todayInTimezone } from "../lib/blog/queue";
import { resolveTags } from "../lib/blog/pipeline";

describe("sanitizeArticleHtml", () => {
  it("demotes h1, drops attributes, links, scripts and images", () => {
    const html = sanitizeArticleHtml(
      '<h1 class="x">Título</h1><p style="color:red">Hola <a href="https://evil.test">aquí</a></p><script>alert(1)</script><img src="x"><p></p>'
    );
    expect(html).toBe("<h2>Título</h2><p>Hola aquí</p>");
  });

  it("keeps tables and lists", () => {
    const html = sanitizeArticleHtml("<table><tr><th>A</th></tr></table><ul><li>uno</li></ul>");
    expect(html).toBe("<table><tr><th>A</th></tr></table><ul><li>uno</li></ul>");
  });
});

describe("keyword helpers", () => {
  it("matches keywords across accents and word order", () => {
    expect(containsKeyword("Tratamiento del ovario poliquístico hoy", "ovario poliquistico tratamiento")).toBe(true);
    expect(containsKeyword("Guía de creatina", "inositol para sop")).toBe(false);
  });

  it("slugifies Spanish text", () => {
    expect(slugify("¿Qué es el SOP? Guía para niñas")).toBe("que-es-el-sop-guia-para-ninas");
  });

  it("truncates at a word boundary", () => {
    const value = truncateAtWord("Inositol para SOP: qué dice la evidencia y cómo tomarlo correctamente", 60);
    expect(value.length).toBeLessThanOrEqual(60);
    expect(value.endsWith("correctamente")).toBe(false);
  });
});

describe("assembleArticleHtml", () => {
  const html = assembleArticleHtml({
    directAnswer: "El inositol es un compuesto <útil>.",
    bodyHtml: "<h2>Qué es</h2><p>Texto</p>",
    faqs: [{ question: "¿Sirve?", answer: "Sí." }],
    ctaText: "Una opción es nuestro inositol.",
    productName: "Inositol Peach Perfect",
    productUrl: "https://peachperfect.com.mx/products/inositol-en-polvo",
    related: [{ title: "Qué es el SOP", url: "https://peachperfect.com.mx/blogs/suplementos/que-es-el-sop" }],
  });

  it("puts the direct answer first, escaped", () => {
    expect(html.startsWith("<p>El inositol es un compuesto &lt;útil&gt;.</p>")).toBe(true);
  });

  it("adds the product CTA, related links and FAQ", () => {
    expect(html).toContain('href="https://peachperfect.com.mx/products/inositol-en-polvo"');
    expect(html).toContain("<h2>Artículos relacionados</h2>");
    expect(html).toContain("<h2>Preguntas frecuentes</h2>");
    expect(html).toContain("<h3>¿Sirve?</h3><p>Sí.</p>");
    expect(countWords(html)).toBeGreaterThan(10);
  });

  it("omits CTA and related section when there is nothing to link", () => {
    const plain = assembleArticleHtml({
      directAnswer: "Respuesta.",
      bodyHtml: "<p>x</p>",
      faqs: [],
      ctaText: "",
      productName: null,
      productUrl: null,
      related: [],
    });
    expect(plain).toBe("<p>Respuesta.</p>\n<p>x</p>");
  });
});

describe("resolveTags", () => {
  it("leads with the product tag the theme CTA keys off", () => {
    expect(resolveTags("inositol", ["SOP", "#hormonas"], ["sop", "creatina"])).toEqual([
      "inositol",
      "sop",
      "hormonas",
    ]);
  });

  it("drops product tags from articles without a product", () => {
    expect(resolveTags("none", ["ciclo", "inositol"])).toEqual(["ciclo"]);
  });
});

describe("buildArticleJsonLd", () => {
  const data = buildArticleJsonLd({
    title: "Qué es el SOP",
    description: "Guía",
    url: "https://peachperfect.com.mx/blogs/suplementos/que-es-el-sop",
    imageUrl: "https://cdn.shopify.com/x.webp",
    datePublished: "2026-11-03T15:00:00Z",
    dateModified: "2026-11-03T15:00:00Z",
    keywords: ["que es el sop"],
    faqs: [{ question: "¿Qué es?", answer: "Un síndrome." }],
  });

  it("includes BlogPosting, BreadcrumbList and FAQPage", () => {
    const types = data["@graph"].map((node) => node["@type"]);
    expect(types).toEqual(["BlogPosting", "BreadcrumbList", "FAQPage"]);
  });

  it("escapes < so the JSON cannot close the script tag", () => {
    expect(renderJsonLdScript({ a: "</script>" })).not.toContain("</script><");
  });
});

describe("blog queue", () => {
  it("is valid, unique and ordered", () => {
    const items = loadBlogQueue();
    expect(items.length).toBeGreaterThanOrEqual(90);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      if (item.product !== "none") expect(item.tags[0]).toBe(item.product);
    }
  });

  it("skips consumed, disabled and future entries", () => {
    const items = loadBlogQueue();
    const [first, second, third] = items;
    const pending = pendingQueueItems(
      [first, { ...second, enabled: false }, { ...third, publishOn: "2999-01-01" }],
      new Set([first.id]),
      todayInTimezone("America/Mexico_City")
    );
    expect(pending).toEqual([]);
  });
});

describe("cover image style", () => {
  it("builds CONSTANTES + ESCENA + VARIABLES", () => {
    const style = pickImageStyle(null, () => 0);
    const prompt = buildCoverPrompt("un bote de inositol junto a una taza de té.", style);
    expect(prompt.startsWith(IMAGE_CONSTANTS)).toBe(true);
    expect(prompt).toContain("Escena: un bote de inositol junto a una taza de té.");
    expect(prompt).toContain(`Superficie: ${style.surface}.`);
    expect(prompt).toContain(`Ángulo y composición: ${style.angle}.`);
    expect(style.props.length).toBeGreaterThanOrEqual(2);
    expect(style.props.length).toBeLessThanOrEqual(3);
    expect(new Set(style.props).size).toBe(style.props.length);
  });

  it("never repeats the previous surface, angle or exact props", () => {
    let previous = pickImageStyle(null);
    for (let i = 0; i < 200; i++) {
      const next = pickImageStyle(previous);
      expect(next.surface).not.toBe(previous.surface);
      expect(next.angle).not.toBe(previous.angle);
      expect([...next.props].sort()).not.toEqual([...previous.props].sort());
      previous = next;
    }
  });

  it("only uses options from the documented lists", () => {
    const style = pickImageStyle(null);
    expect(IMAGE_SURFACES).toContain(style.surface);
    expect(IMAGE_ANGLES).toContain(style.angle);
    for (const prop of style.props) expect(IMAGE_PROPS).toContain(prop);
    expect(isImageStyle(style)).toBe(true);
    expect(isImageStyle({ surface: "x" })).toBe(false);
  });
});
