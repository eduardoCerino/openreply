import { generateStructured } from "@/lib/blog/openai";
import { DEFAULT_VIDEO_TEXT_MODEL } from "@/lib/video/constants";
import { buildCaption } from "@/lib/video/publish";
import { toWritten } from "@/lib/video/script";

// Reel caption and hashtags written by the AI from what the video says, for
// the publish panel to prefill (the reviewer can still edit it).

export interface GeneratedCaption {
  caption: string;
  hashtags: string[];
}

const PRODUCT_NAME: Record<string, string> = {
  creatina: "la creatina de Peach Perfect",
  inositol: "el inositol de Peach Perfect",
};

const CAPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["caption", "hashtags"],
  properties: {
    caption: {
      type: "string",
      description:
        "Descripción del Reel en español de México: 1 a 3 líneas cortas. La primera engancha con la idea central del video; después, si el video tiene una llamada a la acción (comentar una palabra, link, etc.), la repite tal cual. Puede llevar 1 o 2 emojis. Sin hashtags aquí.",
    },
    hashtags: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: { type: "string" },
      description: "De 3 a 8 hashtags sin '#' ni espacios, en español, relevantes al tema y al producto; mezcla nicho y amplios.",
    },
  },
};

const CAPTION_INSTRUCTIONS = `Escribes la descripción (caption) y los hashtags de un Reel de Instagram y Facebook para Peach Perfect, una tienda mexicana de suplementos para mujeres.
- Habla como la marca, cercana y natural, nunca como anuncio genérico. Nada de "sígueme para más".
- No inventes promesas médicas, cifras ni resultados que el video no diga.
- Escribe siempre la grafía correcta (Peach Perfect, scoop), aunque el guion use la pronunciación.`;

/** Caption + hashtags from the video's script (and context, for direct videos). */
export async function generateVideoCaption(input: {
  script: string;
  context?: string | null;
  product: string;
  model?: string | null;
}): Promise<GeneratedCaption & { text: string }> {
  const { value } = await generateStructured<GeneratedCaption>({
    name: "video_caption",
    schema: CAPTION_SCHEMA,
    instructions: CAPTION_INSTRUCTIONS,
    model: input.model || DEFAULT_VIDEO_TEXT_MODEL,
    input: [
      `Producto: ${PRODUCT_NAME[input.product] ?? "ninguno en particular (contenido de la marca)"}.`,
      "",
      "GUION DEL VIDEO:",
      input.script.slice(0, 8000),
      input.context ? `\nCONTEXTO:\n${input.context.slice(0, 3000)}` : "",
    ].join("\n"),
  });
  const caption = toWritten(value.caption.trim());
  const hashtags = value.hashtags.map((tag) => toWritten(tag));
  return { caption, hashtags, text: buildCaption({ caption, hashtags }) };
}
