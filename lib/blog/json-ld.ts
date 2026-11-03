import { BRAND, getBlogConfig } from "@/lib/blog/config";

// schema.org JSON-LD for an article: BlogPosting, FAQPage and BreadcrumbList
// in one @graph, built from the article's real data. The Pitch theme already
// prints a minimal Article; this one carries the FAQ and breadcrumbs and uses
// a distinct @id so the two do not collide.

export interface ArticleJsonLdInput {
  title: string;
  description: string;
  url: string;
  imageUrl?: string | null;
  datePublished: string;
  dateModified: string;
  keywords: string[];
  faqs: Array<{ question: string; answer: string }>;
}

export function buildArticleJsonLd(input: ArticleJsonLdInput) {
  const { publicUrl, blogHandle, author, publisherLogoUrl } = getBlogConfig();
  const blogUrl = `${publicUrl}/blogs/${blogHandle}`;
  const organization = {
    "@type": "Organization",
    "@id": `${publicUrl}/#organization`,
    name: BRAND.name,
    url: publicUrl,
    logo: { "@type": "ImageObject", url: publisherLogoUrl },
  };

  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      "@id": `${input.url}#blogposting`,
      mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
      headline: input.title.slice(0, 110),
      description: input.description,
      ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
      author: { "@type": "Organization", name: `${author} de ${BRAND.name}`, url: publicUrl },
      publisher: organization,
      datePublished: input.datePublished,
      dateModified: input.dateModified,
      inLanguage: "es-MX",
      keywords: input.keywords.join(", "),
      isPartOf: { "@type": "Blog", "@id": `${blogUrl}#blog`, url: blogUrl },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${input.url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: publicUrl },
        { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
        { "@type": "ListItem", position: 3, name: input.title, item: input.url },
      ],
    },
  ];

  if (input.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${input.url}#faq`,
      mainEntity: input.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function renderJsonLdScript(data: unknown): string {
  // Escaping "<" keeps "</script>" inside a string from closing the tag.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
