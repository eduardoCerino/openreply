import { BRAND, PRODUCTS, type BlogProduct } from "@/lib/blog/config";

export interface ArticleBrief {
  keyword: string;
  secondaryKeywords: string[];
  title?: string;
  angle?: string;
  idea?: string;
  intent: "informativa" | "comercial";
  product: BlogProduct;
  tags: string[];
}

export interface GeneratedArticle {
  title: string;
  titleTag: string;
  metaDescription: string;
  slug: string;
  summary: string;
  directAnswer: string;
  bodyHtml: string;
  faqs: Array<{ question: string; answer: string }>;
  ctaText: string;
  tags: string[];
  imageAlt: string;
  imagePrompt: string;
}

const str = (description: string) => ({ type: "string", description });

export const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "titleTag",
    "metaDescription",
    "slug",
    "summary",
    "directAnswer",
    "bodyHtml",
    "faqs",
    "ctaText",
    "tags",
    "imageAlt",
    "imagePrompt",
  ],
  properties: {
    title: str("Título visible del artículo (será el único H1). Incluye el keyword principal."),
    titleTag: str("Title tag SEO, máximo 60 caracteres, con el keyword al inicio."),
    metaDescription: str("Meta description, máximo 155 caracteres, con el keyword y un beneficio claro."),
    slug: str("Handle en minúsculas, sin acentos, palabras separadas por guiones, basado en el keyword."),
    summary: str("Extracto de 1-2 oraciones para el listado del blog."),
    directAnswer: str(
      "Respuesta directa de 2 a 4 oraciones autoconclusivas a la pregunta/keyword. Debe contener el keyword principal. Texto plano, sin HTML."
    ),
    bodyHtml: str(
      "Cuerpo en HTML limpio SIN h1, SIN la respuesta directa, SIN FAQ y SIN enlaces. Solo h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td."
    ),
    faqs: {
      type: "array",
      description: "3 a 5 preguntas frecuentes con respuestas cortas (1-3 oraciones).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: { question: str("Pregunta"), answer: str("Respuesta en texto plano") },
      },
    },
    ctaText: str(
      "1-2 oraciones de cierre que presenten el producto asociado como opción, en tono suave y factual. Cadena vacía si no hay producto."
    ),
    tags: {
      type: "array",
      description: "3 a 6 tags en minúsculas, sin acentos ni #.",
      items: { type: "string" },
    },
    imageAlt: str("Texto ALT de la imagen de portada, descriptivo y con el keyword principal, máximo 125 caracteres."),
    imagePrompt: str(
      "ESCENA de la portada en español: una sola oración corta con los objetos principales de un flat lay relacionado con el tema. Sin superficie, ángulo ni estilo (los agrega el sistema). Sin personas, texto, logos ni nada clínico."
    ),
  },
} as const;

function productBlock(product: BlogProduct): string {
  if (product === "none") {
    return "Producto asociado: ninguno. No recomiendes productos de la marca; ctaText debe ser una cadena vacía.";
  }
  const p = PRODUCTS[product];
  return [
    `Producto asociado: ${p.name} (menciónalo como "${p.shortName}" o "${p.name}", siempre igual).`,
    `Diferenciador: ${p.differentiator}.`,
    `Hechos verificados que puedes usar (no agregues otros sobre el producto):`,
    ...p.facts.map((fact) => `- ${fact}`),
  ].join("\n");
}

export function buildInstructions(): string {
  return `Eres editora senior de contenidos de salud y bienestar femenino para ${BRAND.name}, una marca mexicana. ${BRAND.description}

Escribes artículos de blog que posicionan en Google (SEO) y que asistentes de IA como ChatGPT, Claude, Gemini y Perplexity puedan entender, citar y recomendar (GEO).

IDIOMA Y TONO
- Español de México, cálido y cercano, dirigido a mujeres. Tutea ("tú"). Claro, sin tecnicismos innecesarios; si usas un término técnico, defínelo en la misma oración.
- Nada de hype, promesas de curación ni lenguaje alarmista. Es contenido informativo, no sustituye la consulta médica: menciónalo una vez de forma natural cuando el tema sea de salud.

ESTRUCTURA SEO ON-PAGE
- El título (title) es el ÚNICO H1 y contiene el keyword principal. No escribas h1 en bodyHtml.
- La respuesta directa (directAnswer) va justo debajo del H1: 2-4 oraciones que respondan por sí solas a la pregunta del keyword e incluyan el keyword.
- El keyword principal aparece en el H1, en el primer párrafo de bodyHtml y en al menos un H2. Usa los keywords secundarios de forma natural.
- bodyHtml: secciones con h2 y h3, párrafos cortos (2-4 oraciones), al menos una lista. Si el tema lo permite (comparar opciones, formas, dosis, alimentos), incluye UNA tabla comparativa simple.
- Extensión total (respuesta directa + cuerpo + FAQ): entre 900 y 1200 palabras.

GEO / CONTENIDO EXTRAÍBLE
- Oraciones autocontenidas: cada una se entiende sin leer la anterior (repite el sujeto en vez de "esto", "lo anterior").
- Definiciones explícitas con la forma "X es...".
- Datos y cifras concretas solo si son ampliamente aceptados y verificables (por ejemplo prevalencias o dosis habituales reportadas en la literatura). Si no estás segura de una cifra, no la pongas.
- Puedes mencionar organizaciones o publicaciones reconocidas solo si estás segura de que el dato les corresponde. Nunca inventes estudios, siglas, cifras, citas ni URLs.
- Para temas nuevos o poco conocidos, limita el contenido a lo verificable y dilo con claridad.

MARCA Y PRODUCTO
- Cuando haya producto asociado, menciona la marca ${BRAND.name} y el producto de forma explícita y consistente, con su diferenciador, como una opción entre otras y de forma factual (máximo 2-3 menciones en todo el artículo, incluida ctaText).
- No inventes precios, ingredientes, certificaciones, resultados ni testimonios.

FAQ
- 3 a 5 preguntas reales que la gente busca sobre el tema, con respuestas cortas y autoconclusivas. No las repitas dentro de bodyHtml.

PROHIBIDO
- Enlaces (<a>) en cualquier campo: los enlaces internos los agrega el sistema.
- Atributos de estilo, clases, scripts, imágenes o emojis en el HTML.

IMAGEN
- imagePrompt es solo la ESCENA de un flat lay (objetos vistos desde arriba) que represente el tema, en una oración. El sistema le agrega el estilo de marca, la superficie, los props y el ángulo.
- Top, comparativas o "mejor X": por ejemplo, "varios botes y scoops de suplementos en polvo rosados alineados como comparativa".
- Salud y hormonas (SOP, SOMP, inositol, ciclo): escena sobria y calmada, por ejemplo "un bote de suplemento en polvo junto a una taza de té y flores", nunca nada clínico.
- Entrenamiento, glúteos o creatina: por ejemplo, "un shaker con bebida rosada, un scoop de polvo y una liga de resistencia doblada".
- Nutrición: ingredientes o un platillo sencillo vistos desde arriba.
- Nunca personas, manos, texto, etiquetas legibles, logos, pastillas, jeringas ni batas.`;
}

export function buildInput(brief: ArticleBrief, feedback?: string): string {
  const lines = [
    `Keyword principal: ${brief.keyword}`,
    brief.secondaryKeywords.length
      ? `Keywords secundarias: ${brief.secondaryKeywords.join(", ")}`
      : null,
    brief.title ? `Título sugerido: ${brief.title}` : null,
    brief.angle ? `Ángulo: ${brief.angle}` : null,
    brief.idea ? `Idea de la autora (respétala como enfoque principal): ${brief.idea}` : null,
    `Intención de búsqueda: ${brief.intent}${
      brief.intent === "comercial"
        ? " (la lectora está evaluando opciones: ayúdala a decidir con criterios claros)"
        : " (la lectora quiere entender el tema: educa primero)"
    }`,
    brief.tags.length ? `Tags sugeridos: ${brief.tags.join(", ")}` : null,
    "",
    productBlock(brief.product),
  ];
  if (feedback) {
    lines.push("", `Corrige estos problemas de la versión anterior: ${feedback}`);
  }
  return lines.filter((line) => line !== null).join("\n");
}
