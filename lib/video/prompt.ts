import {
  CLIP_SECONDS,
  HOOK_MOLDS,
  MAX_VIDEO_SECONDS,
  SCENE_COUNT,
  VIDEO_CTA,
  type VideoChannel,
  type VideoProduct,
} from "@/lib/video/config";

export type SceneSection = "gancho" | "contexto" | "aterrizaje" | "cierre";

export interface VideoScene {
  section: SceneSection;
  startSecond: number;
  endSecond: number;
  voiceover: string;
  onScreenText: string;
  visual: string;
  productVisible: boolean;
  startFramePrompt: string;
  endFramePrompt: string;
  motionPrompt: string;
}

export interface VideoScript {
  title: string;
  hookMold: string;
  hook: string;
  symptom: string;
  character: string;
  visualStyle: string;
  scenes: VideoScene[];
  cta: string;
  caption: string;
  hashtags: string[];
  storyFollowUps: string[];
}

const str = (description: string) => ({ type: "string", description });

export const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "hookMold",
    "hook",
    "symptom",
    "character",
    "visualStyle",
    "scenes",
    "cta",
    "caption",
    "hashtags",
    "storyFollowUps",
  ],
  properties: {
    title: str("Nombre interno corto del video."),
    hookMold: str("Molde de gancho usado (copia el molde) o 'propio' si no encaja ninguno."),
    hook: str("La frase exacta de los primeros 3 segundos, como ella la diría."),
    symptom: str("El síntoma cotidiano del que parte el video, con las palabras de ella."),
    character: str(
      "Descripción física fija de la protagonista (edad, rasgos, cabello, ropa) para que las 10 imágenes muestren a la misma mujer. Sin nombre real ni parecido a alguien famoso."
    ),
    visualStyle: str("Estilo visual fijo para todas las imágenes: luz, paleta, lugar, tipo de toma."),
    scenes: {
      type: "array",
      description: `Exactamente ${SCENE_COUNT} escenas, una por clip de video, en orden.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section",
          "startSecond",
          "endSecond",
          "voiceover",
          "onScreenText",
          "visual",
          "productVisible",
          "startFramePrompt",
          "endFramePrompt",
          "motionPrompt",
        ],
        properties: {
          section: { type: "string", enum: ["gancho", "contexto", "aterrizaje", "cierre"] },
          startSecond: { type: "integer" },
          endSecond: { type: "integer" },
          voiceover: str("Lo que se dice en esta escena (voz o a cámara)."),
          onScreenText: str("Texto en pantalla, corto. Cadena vacía si no hay."),
          visual: str("Qué se ve en la escena, en español."),
          productVisible: { type: "boolean", description: "true solo si el bote aparece en esta escena." },
          startFramePrompt: str(
            "Prompt en inglés para la imagen del PRIMER fotograma de la escena (vertical 9:16, fotorrealista). Repite la descripción de la protagonista."
          ),
          endFramePrompt: str(
            "Prompt en inglés para la imagen del ÚLTIMO fotograma de la escena. Debe ser el mismo plano después del movimiento y servir de puente visual a la escena siguiente."
          ),
          motionPrompt: str(
            "Instrucción en inglés para el modelo de video: qué se mueve entre el primer y el último fotograma (acción, cámara, ritmo)."
          ),
        },
      },
    },
    cta: str("El cierre, exactamente la línea de CTA indicada."),
    caption: str("Descripción del post para Instagram/TikTok, 1-3 líneas, que repita el CTA."),
    hashtags: { type: "array", items: { type: "string" }, description: "3 a 6 hashtags sin espacios." },
    storyFollowUps: {
      type: "array",
      items: { type: "string" },
      description: "2-3 ideas de historias de confianza para el mismo tema (objeciones resueltas, la fórmula, por qué 80:1).",
    },
  },
} as const;

export function buildScriptInstructions(brandContext: string): string {
  const total = MAX_VIDEO_SECONDS;
  const clipSeconds = CLIP_SECONDS;
  return `Eres guionista de videos cortos verticales (Reels/TikTok) para Peach Perfect México. Sigue al pie de la letra el documento de marca y método que va abajo: es la única fuente de datos sobre la marca, los productos y la estructura. No inventes nada que no esté ahí (fórmulas, sabores, presentaciones, certificaciones, precios, testimonios).

FORMATO
- Video vertical 9:16 de ${total} segundos, dividido en exactamente ${SCENE_COUNT} escenas de ${clipSeconds} segundos. Cada escena es un clip independiente que un modelo de video genera a partir de una imagen inicial y una final, así que cada escena debe ser una sola toma continua y simple.
- Escena 1 = gancho (el gancho se dice en los primeros 3 segundos). Escenas 2 y 3 = contexto, ponerle nombre a lo que le pasa. Escena 4 = aterrizaje en el producto. Escena 5 = cierre con el CTA.
- Es un video corto: cada escena dice UNA sola idea. Ritmo rápido, sin relleno.
- startSecond/endSecond: consecutivos desde 0, ${clipSeconds} segundos cada escena.
- voiceover: frases cortas, ritmo hablado natural; máximo unas ${Math.round(clipSeconds * 2.6)} palabras por escena.

ESTRUCTURA (sección 5 del documento)
- Gancho: el síntoma cotidiano dicho como ella lo diría. Cero marca, cero producto, cero tecnicismo (nada de mg, proporciones, nombres de compuestos).
- Contexto: explica el porqué con conocimiento real. Muestra el qué, guarda el cómo: no regales la solución completa.
- Aterrizaje: Peach Perfect entra como consecuencia natural de lo explicado, no como anuncio. Aquí sí puedes usar el diferenciador del producto.
- Cierre: el CTA fijo, palabra por palabra.
- El bote del producto NO aparece antes de la escena de aterrizaje (productVisible=false en las escenas 1 a 3).
- Prohibido: "sígueme para más", abrir nombrando la marca, unboxing, mostrar la etiqueta como tema, música épica de gym como idea central.

IMÁGENES (para la fase siguiente)
- Una misma protagonista en todo el video (campo character) y un estilo visual fijo (campo visualStyle): mujer mexicana real de 20-40 años, en situaciones cotidianas creíbles (casa, baño, cocina, gym de barrio, recámara), luz natural, tonos rosa y durazno sutiles. Nada clínico.
- Cada prompt de fotograma es autosuficiente: repite la descripción de la protagonista y el estilo, en inglés, fotorrealista, vertical 9:16.
- Sin texto, letras ni logos dentro de las imágenes (el texto en pantalla se agrega en edición). Cuando aparezca el bote, descríbelo como un bote rosa de suplemento en polvo sin etiqueta legible.
- El fotograma final de una escena y el inicial de la siguiente deben conectar visualmente.

GUARDRAILS (sección 11 del documento)
- Nunca antes/después de peso corporal, restricción alimentaria, conteo obsesivo ni vergüenza corporal. La marca habla de fuerza y de entender el cuerpo.
- Inositol: solo en polvo con scoop, proporción 80:1 (nunca 40:1), nunca cápsulas.
- No prometas curar ni tratar enfermedades.

DOCUMENTO DE MARCA Y MÉTODO
${brandContext}`;
}

export interface ScriptBrief {
  idea: string;
  product: VideoProduct;
  channel: VideoChannel;
  hookMold?: string | null;
}

export function buildScriptInput(
  brief: ScriptBrief,
  revision?: { previous: VideoScript; feedback: string }
): string {
  const cta = VIDEO_CTA[brief.product];
  const lines = [
    `Idea: ${brief.idea}`,
    `Producto de aterrizaje: ${brief.product === "creatina" ? "Creatina Pink Lemonade (glúteos)" : "Inositol Multivitamin Pink Lemonade (hormonas, SOP)"}`,
    `CTA fijo del cierre: "${cta.line}"`,
    brief.channel === "pagado"
      ? "Canal: ANUNCIO PAGADO (Meta/TikTok Ads). Nada de segunda persona sobre la condición de salud: reformula el dolor en tercera persona o como pregunta general (\"hay mujeres que...\"). Sin antes/después."
      : "Canal: ORGÁNICO. El dolor puede ir crudo y en segunda persona, con las palabras de ella.",
    brief.hookMold
      ? `Usa este molde de gancho: ${brief.hookMold}`
      : `Elige el molde de gancho que mejor encaje con la idea:\n${HOOK_MOLDS.map((mold, i) => `${i + 1}. ${mold}`).join("\n")}`,
  ];
  if (revision) {
    lines.push(
      "",
      "Esta es una revisión. Guion anterior (JSON):",
      JSON.stringify(revision.previous),
      "",
      `Cambios que pide la revisora (aplícalos y conserva lo demás): ${revision.feedback}`
    );
  }
  return lines.join("\n");
}
