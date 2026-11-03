// Store, brand and product facts the blog pipeline writes about. Everything
// that identifies the shop comes from env so nothing store-specific is a
// secret in the repo; the product copy below is public marketing fact.

export type BlogProduct = "inositol" | "creatina" | "none";

export interface ProductFacts {
  tag: "inositol" | "creatina";
  name: string;
  path: string;
  shortName: string;
  differentiator: string;
  facts: string[];
}

export const PRODUCTS: Record<Exclude<BlogProduct, "none">, ProductFacts> = {
  creatina: {
    tag: "creatina",
    name: "Peach Perfect Creatina",
    shortName: "Creatina Peach Perfect",
    path: "/products/creatina-para-mujeres",
    differentiator:
      "creatina para mujeres con colágeno, pensada para acompañar el entrenamiento de glúteos y pierna",
    facts: [
      "Fórmula de creatina para mujeres que incluye colágeno.",
      "Enfocada en apoyar la fuerza y el entrenamiento de glúteos.",
      "Se vende en presentaciones de 1, 3 y 6 frascos con envío a todo México.",
    ],
  },
  inositol: {
    tag: "inositol",
    name: "Peach Perfect Inositol 135g",
    shortName: "Inositol Peach Perfect",
    path: "/products/inositol-en-polvo",
    differentiator:
      "inositol en polvo para mujeres que combina myo-inositol y d-chiro-inositol en proporción 80:1",
    facts: [
      "Inositol en polvo (135 g) que combina myo-inositol y d-chiro-inositol en proporción 80:1.",
      "Pensado para mujeres que buscan apoyar su balance hormonal, por ejemplo con SOP/SOMP.",
      "Se vende en presentaciones de 1, 3 y 6 frascos con envío a todo México.",
    ],
  },
};

export const BRAND = {
  name: "Peach Perfect",
  description:
    "Suplementos hechos para mujeres: creatina con colágeno para tus glúteos e inositol para tu balance hormonal. Envío a todo México.",
};

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function getBlogConfig() {
  const publicUrl = env("SHOP_PUBLIC_URL", "https://peachperfect.com.mx").replace(/\/+$/, "");
  return {
    shopDomain: env("SHOPIFY_STORE_DOMAIN", "6uijcm-ma.myshopify.com"),
    apiVersion: env("SHOPIFY_API_VERSION", "2026-10"),
    blogHandle: env("SHOPIFY_BLOG_HANDLE", "suplementos"),
    publicUrl,
    author: env("BLOG_AUTHOR", "Equipo editorial"),
    publisherLogoUrl: env(
      "BLOG_PUBLISHER_LOGO_URL",
      "https://peachperfect.com.mx/cdn/shop/files/pp_logo_white_a6b05807-1f62-48ff-8ce8-2535a44b3f08.webp?v=1792693781&width=500"
    ),
    textModel: env("OPENAI_MODEL", "gpt-6.1-terra"),
    imageModel: env("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare"),
    autopublishEnabled: process.env.BLOG_AUTOPUBLISH_ENABLED === "true",
    dailyCron: env("BLOG_DAILY_CRON", "0 9 * * *"),
    timezone: env("BLOG_TIMEZONE", "America/Mexico_City"),
  };
}

export function productUrl(product: BlogProduct): string | null {
  if (product === "none") return null;
  return `${getBlogConfig().publicUrl}${PRODUCTS[product].path}`;
}

export function articleUrl(handle: string): string {
  const { publicUrl, blogHandle } = getBlogConfig();
  return `${publicUrl}/blogs/${blogHandle}/${handle}`;
}

// Missing env names for the parts of the pipeline that call out. Surfaced in
// the panel so a half-configured deploy says what to set instead of failing
// mid-run.
export function getMissingBlogEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (
    !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN &&
    !(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
  ) {
    missing.push("SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET");
  }
  return missing;
}
