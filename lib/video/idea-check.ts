import { generateStructured } from "@/lib/blog/openai";
import {
  AWARENESS_LEVELS,
  IDEA_FILTERS,
  IDEA_MIN_SCORE,
  type IdeaFilterId,
  type VideoProduct,
} from "@/lib/video/constants";

// The winning-idea checklist, applied behind the scenes before writing. The
// reviewer sends a short idea (a few words), not a finished angle, so the
// checklist does not reject it: it scores the raw idea, develops it into an
// angle that meets the filters, and the script is written from that angle.

type FilterResults = Record<IdeaFilterId, { passed: boolean; reason: string }>;

export interface IdeaCheck {
  /** The raw idea as the reviewer wrote it. */
  filters: FilterResults;
  score: number;
  /** The idea developed into an angle that meets the filters; the script uses it. */
  angle: string;
  angleFilters: FilterResults;
  angleScore: number;
  /** The developed angle reaches IDEA_MIN_SCORE. Never blocks writing. */
  passed: boolean;
  /** A comparable idea that already worked in another language or niche. */
  viralReference: string;
}

interface IdeaCheckOutput {
  filters: FilterResults;
  angle: string;
  angleFilters: FilterResults;
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

const filtersSchema = {
  type: "object",
  additionalProperties: false,
  required: IDEA_FILTERS.map((filter) => filter.id),
  properties: Object.fromEntries(IDEA_FILTERS.map((filter) => [filter.id, filterSchema])),
};

const IDEA_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["filters", "angle", "angleFilters", "viralReference"],
  properties: {
    filters: { ...filtersSchema, description: "Evaluación de la idea tal como la escribió la revisora." },
    angle: {
      type: "string",
      description:
        "La idea desarrollada en un ángulo de video concreto (1-2 oraciones, con las palabras de ella) que conserva la idea de la revisora y cumple al menos 5 de los 8 filtros.",
    },
    angleFilters: { ...filtersSchema, description: "Evaluación honesta del ángulo desarrollado." },
    viralReference: {
      type: "string",
      description:
        "Un ángulo comparable que ya funcionó en otro idioma o nicho, descrito en una línea. Cadena vacía si no conoces uno: no lo inventes.",
    },
  },
} as const;

function instructions(): string {
  return `Trabajas para Peach Perfect, una marca mexicana de suplementos para mujeres (creatina para glúteos e inositol para hormonas y SOP). La revisora te manda una IDEA corta, de unas cuantas palabras: todavía no es un ángulo ni un guion. Tu trabajo es convertirla en una idea ganadora. La regla del método: video viral = idea ganadora, siempre.

Los 8 filtros:
${IDEA_FILTERS.map((filter, index) => `${index + 1}. ${filter.id} (${filter.label}): ${filter.test}`).join("\n")}

Pasos:
1. Evalúa la idea tal cual (filters). Sé honesta: una idea de pocas palabras normalmente no pasa todos.
2. Desarróllala en un ángulo (angle) que CONSERVE la idea de la revisora y la lleve a cumplir al menos ${IDEA_MIN_SCORE} filtros: encuentra la creencia que contradice, el síntoma cotidiano con las palabras de ella, lo que la hace polémica y aplicable a cualquier mujer. No cambies de tema.
3. Evalúa el ángulo con la misma honestidad (angleFilters).

Notas:
- referencia: solo pasa si de verdad conoces un ángulo parecido que funcionó en otro idioma o nicho; descríbelo en viralReference. Nunca lo inventes.
- Un ángulo que explica qué es un ingrediente, habla de fórmula, dosis o certificaciones, o compara marcas le habla al ~5% del mercado (niveles de conciencia 3-4): falla 5-50, unicidad y aplicable.
- El ángulo entra por el síntoma que ella vive, no por el producto.

Niveles de conciencia válidos para reels (para orientar el ángulo):
${Object.entries(AWARENESS_LEVELS).map(([level, info]) => `- ${level}: ${info.state}. Ejemplo: "${info.example}"`).join("\n")}

Ejemplos:
- Idea "qué es el myo-inositol" → como está falla contracorriente, 5-50, unicidad y aplicable. Ángulo: "Tu acné de la mandíbula no está en tu piel: por qué vuelve siempre la misma semana del mes" (6/8).
- Idea "creatina inflama" → ángulo: "La creatina no te infla: lo que sentiste las primeras semanas no es lo que crees" (6/8).`;
}

export async function checkIdea(
  idea: string,
  product: VideoProduct,
  textModel?: string
): Promise<{ check: IdeaCheck; model: string }> {
  const { value, model } = await generateStructured<IdeaCheckOutput>({
    name: "idea_check",
    model: textModel,
    schema: IDEA_CHECK_SCHEMA as unknown as Record<string, unknown>,
    instructions: instructions(),
    input: `Idea: ${idea}\nProducto en el que aterrizará el video: ${product}`,
  });
  return { check: scoreIdeaCheck(value), model };
}

function countPassed(filters: FilterResults | undefined): number {
  return IDEA_FILTERS.filter((filter) => filters?.[filter.id]?.passed).length;
}

/** Score in code: the model reports each filter, it does not do the math. */
export function scoreIdeaCheck(output: IdeaCheckOutput): IdeaCheck {
  const angleScore = countPassed(output.angleFilters);
  return {
    filters: output.filters,
    score: countPassed(output.filters),
    angle: (output.angle ?? "").trim(),
    angleFilters: output.angleFilters,
    angleScore,
    passed: angleScore >= IDEA_MIN_SCORE,
    viralReference: output.viralReference ?? "",
  };
}
