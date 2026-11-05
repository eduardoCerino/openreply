import { generateStructured } from "@/lib/blog/openai";
import {
  AWARENESS_LEVELS,
  IDEA_FILTERS,
  IDEA_MIN_SCORE,
  type IdeaFilterId,
  type VideoProduct,
} from "@/lib/video/constants";

// The winning-idea checklist, run before any script is written. It is its own
// call so a weak idea costs one short evaluation instead of a full script.

export interface IdeaCheck {
  filters: Record<IdeaFilterId, { passed: boolean; reason: string }>;
  score: number;
  passed: boolean;
  /** Two rewrites of the same idea that would pass, shown when it fails. */
  reformulations: string[];
  /** A comparable idea that already worked in another language or niche. */
  viralReference: string;
}

interface IdeaCheckOutput {
  filters: Record<IdeaFilterId, { passed: boolean; reason: string }>;
  reformulations: string[];
  viralReference: string;
}

const filterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "reason"],
  properties: {
    passed: { type: "boolean" },
    reason: { type: "string", description: "Una oración concreta: por qué pasa o por qué no." },
  },
};

const IDEA_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["filters", "reformulations", "viralReference"],
  properties: {
    filters: {
      type: "object",
      additionalProperties: false,
      required: IDEA_FILTERS.map((filter) => filter.id),
      properties: Object.fromEntries(IDEA_FILTERS.map((filter) => [filter.id, filterSchema])),
    },
    reformulations: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactamente 2 reformulaciones de la MISMA idea de fondo, escritas como un título de video con las palabras de ella, que sí pasarían al menos 5 de los 8 filtros.",
    },
    viralReference: {
      type: "string",
      description:
        "Un ángulo comparable que ya funcionó en otro idioma o nicho, descrito en una línea. Cadena vacía si no conoces uno: no lo inventes.",
    },
  },
} as const;

function instructions(): string {
  return `Evalúas ideas de video corto (Reels/TikTok) para Peach Perfect, una marca mexicana de suplementos para mujeres (creatina para glúteos e inositol para hormonas y SOP). La regla del método: video viral = idea ganadora, siempre. Ningún formato, cámara ni edición salva una idea mala.

Pasa la idea por estos 8 filtros. Sé estricta y honesta: un filtro solo pasa si lo cumple con claridad.
${IDEA_FILTERS.map((filter, index) => `${index + 1}. ${filter.id} (${filter.label}): ${filter.test}`).join("\n")}

Notas:
- referencia: solo pasa si de verdad conoces un ángulo parecido que funcionó en otro idioma o nicho; descríbelo en viralReference. Nunca lo inventes.
- Una idea que explica qué es un ingrediente, habla de fórmula, dosis o certificaciones, o compara marcas le habla al ~5% del mercado (niveles de conciencia 3-4): falla 5-50, unicidad y aplicable.
- La idea entra por el síntoma que ella vive, no por el producto.

Niveles de conciencia válidos para reels (para orientar las reformulaciones):
${Object.entries(AWARENESS_LEVELS).map(([level, info]) => `- ${level}: ${info.state}. Ejemplo: "${info.example}"`).join("\n")}

Ejemplos:
- "Qué es el myo-inositol y para qué sirve" → falla contracorriente, 5-50, unicidad y aplicable. No se escribe.
- "Tu acné no está en tu piel" → cumple contracorriente, 5-50, aplicable, polémico y formato. 5/8, procede.
- "La creatina no te infla: lo que sentiste no es lo que crees" → 6/8.

Las 2 reformulaciones conservan la idea de fondo y la reescriben para que pase al menos ${IDEA_MIN_SCORE} filtros.`;
}

export async function checkIdea(
  idea: string,
  product: VideoProduct
): Promise<{ check: IdeaCheck; model: string }> {
  const { value, model } = await generateStructured<IdeaCheckOutput>({
    name: "idea_check",
    schema: IDEA_CHECK_SCHEMA as unknown as Record<string, unknown>,
    instructions: instructions(),
    input: `Idea: ${idea}\nProducto en el que aterrizará el video: ${product}`,
  });
  return { check: scoreIdeaCheck(value), model };
}

/** Score in code: the model reports each filter, it does not do the math. */
export function scoreIdeaCheck(output: IdeaCheckOutput): IdeaCheck {
  const score = IDEA_FILTERS.filter((filter) => output.filters[filter.id]?.passed).length;
  return {
    filters: output.filters,
    score,
    passed: score >= IDEA_MIN_SCORE,
    reformulations: (output.reformulations ?? []).slice(0, 2),
    viralReference: output.viralReference ?? "",
  };
}
