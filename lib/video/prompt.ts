import {
  CLIP_SECONDS,
  FORMAT_SELECTION,
  HOOK_MOLDS,
  MAX_VIDEO_SECONDS,
  SCENE_COUNT,
  SCENE_WORDS_MAX,
  SCRIPT_WORDS_MAX,
  SCRIPT_WORDS_MIN,
  VIDEO_CTA,
  VIDEO_FORMATS,
  VIDEO_FORMAT_IDS,
  type VideoChannel,
  type VideoFormat,
  type VideoProduct,
} from "@/lib/video/constants";

export type SceneSection = "gancho" | "contexto" | "aterrizaje" | "cierre";

/** One spoken line. Single-voice formats use one speaker throughout. */
export interface VideoLine {
  speaker: string;
  text: string;
  /** Framing or action note, shown in brackets. Empty when there is none. */
  direction: string;
}

export interface VideoScene {
  section: SceneSection;
  startSecond: number;
  endSecond: number;
  lines: VideoLine[];
  /** All spoken text of the scene, joined from `lines` by normalizeScript. */
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
  format: VideoFormat;
  formatReason: string;
  /** Reaction format only: the audience comment shown on screen (the hook). */
  onScreenComment: string;
  hookMold: string;
  hook: string;
  symptom: string;
  newInsight: string;
  feltLine: string;
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
    "format",
    "formatReason",
    "onScreenComment",
    "hookMold",
    "hook",
    "symptom",
    "newInsight",
    "feltLine",
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
    format: { type: "string", enum: VIDEO_FORMAT_IDS },
    formatReason: str("Una línea: por qué este formato comunica mejor esta idea."),
    onScreenComment: str(
      "Solo formato reaccion: el comentario o DM de su propia audiencia que se ve en pantalla (es el gancho). Cadena vacía en los demás formatos."
    ),
    hookMold: str("Molde de gancho usado (copia el molde) o 'propio' si no encaja ninguno."),
    hook: str(
      "La frase exacta de los primeros 3 segundos: narración en formatos de una voz, primera línea de diálogo en POV/Personaje, el comentario en Reacción."
    ),
    symptom: str("El síntoma cotidiano del que parte el video, con las palabras de ella."),
    newInsight: str(
      "Copia EXACTA de la línea del cuerpo que le dice algo que ella NO sabía: un mecanismo, una señal concreta o un dato de tiempo."
    ),
    feltLine: str(
      "Copia EXACTA de la línea del cuerpo que nombra lo que ella SINTIÓ (no lo que le pasó)."
    ),
    character: str(
      "Descripción física fija de cada persona que sale, con su etiqueta de personaje (edad, rasgos, cabello, ropa), para que las 10 imágenes muestren a las mismas personas. Sin nombres reales ni parecido a alguien famoso."
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
          "lines",
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
          lines: {
            type: "array",
            description: "Lo que se dice en la escena, en orden. Una voz: una o dos líneas del mismo speaker. Diálogo: alterna speakers.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "text", "direction"],
              properties: {
                speaker: str("Etiqueta del personaje que habla (\"Ella\", \"Voz en off\", \"Amiga\", \"La que sabe\"…), siempre la misma para la misma persona."),
                text: str("La línea hablada, palabra por palabra."),
                direction: str("Nota de encuadre o acción (sin corchetes). Cadena vacía si no aplica."),
              },
            },
          },
          onScreenText: str("Texto en pantalla, corto (no se dice en voz alta). Cadena vacía si no hay."),
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

function formatCatalog(): string {
  return VIDEO_FORMAT_IDS.map((id, index) => {
    const spec = VIDEO_FORMATS[id];
    return `${index + 1}. ${id} — ${spec.label}: ${spec.description} Para: ${spec.bestFor}. Producción: ${spec.production}`;
  }).join("\n");
}

function selectionTable(): string {
  return FORMAT_SELECTION.map((row) => `- ${row.idea} → ${row.formats.join(" · ")}`).join("\n");
}

export function buildScriptInstructions(brandContext: string): string {
  const total = MAX_VIDEO_SECONDS;
  const clipSeconds = CLIP_SECONDS;
  return `Eres guionista de videos cortos verticales (Reels/TikTok) para Peach Perfect México. Sigue al pie de la letra el documento de marca y método que va abajo: es la única fuente de datos sobre la marca, los productos y la estructura. No inventes nada que no esté ahí (fórmulas, sabores, presentaciones, certificaciones, precios, testimonios).

FORMATO
- Video vertical 9:16 de ${total} segundos, dividido en exactamente ${SCENE_COUNT} escenas de ${clipSeconds} segundos. Cada escena es un clip independiente que un modelo de video genera a partir de una imagen inicial y una final, así que cada escena debe ser una sola toma continua y simple.
- Escena 1 = gancho (el gancho se dice en los primeros 3 segundos). Escenas 2 y 3 = cuerpo. Escena 4 = aterrizaje en el producto. Escena 5 = cierre con el CTA.
- startSecond/endSecond: consecutivos desde 0, ${clipSeconds} segundos cada escena.
- Extensión: ${SCRIPT_WORDS_MIN} a ${SCRIPT_WORDS_MAX} palabras habladas en total, en cualquier formato, máximo ${SCENE_WORDS_MAX} por escena. El texto en pantalla no cuenta. El problema nunca es la velocidad: es la palabra vacía. Cada palabra tiene que cargar algo; si una frase se puede quitar sin perder nada, quítala y usa ese espacio en el dato o en la emoción.

FORMATO DE VIDEO (la puesta en escena)
Regla madre: el formato se elige por cuál comunica mejor la idea, NUNCA por cuál parece más viral.
${formatCatalog()}

Tabla de selección (cuando el formato es auto, elige con esta tabla y explica en formatReason, en una línea, por qué):
${selectionTable()}

Cómo cambia la estructura según el formato (los cuatro tiempos gancho → cuerpo → producto → CTA se mantienen siempre):
- hac, vof, vlog, dinamico: una sola voz y estructura directa. Todas las líneas con el mismo speaker ("Ella" o "Voz en off" en vof).
- pov, personaje: el gancho es la primera línea de diálogo, no una narración. El dato nuevo (newInsight) lo dice el personaje que sabe; la emoción (feltLine) la dice el que no sabe. Cada línea lleva su speaker y, cuando aplique, su nota de encuadre o acción en direction.
- reaccion: el comentario en pantalla (onScreenComment) ES el gancho: el espectador lo lee unos 2 segundos en silencio, y la primera frase de ella ya es cuerpo. Solo comentarios o DMs de su propia audiencia: nunca reaccionar al video de otra persona ni confrontar a otra marca o creadora. Escribe el comentario como lo escribiría una seguidora real (sin @usuario); la revisora lo cambiará por uno real.
- vlog: hay pausas de acción; usa direction para marcar lo que hace mientras habla.
- dinamico: varios encuadres y texto en pantalla en casi todas las escenas; el texto en pantalla complementa, no repite lo que se dice.

ESTRUCTURA (sección 5 del documento)
- Gancho: el síntoma cotidiano dicho como ella lo diría. Cero marca, cero producto, cero tecnicismo (nada de mg, proporciones, nombres de compuestos).
- Cuerpo (escenas 2 y 3; en reacción también la voz de la escena 1): explica el porqué con conocimiento real. Muestra el qué, guarda el cómo: no regales la solución completa.
- Aterrizaje (escena 4, segundos 15-20, el equivalente proporcional del ~0:45): el producto se NOMBRA y nada más. Puedes decir su nombre y datos exactos de la ficha (por ejemplo la proporción 80:1), pero nunca le atribuyas un efecto: nada de "te ayuda", "mejora", "regula", "equilibra", "reduce", "hace que".
- Cierre: el CTA fijo, palabra por palabra.
- El bote del producto NO aparece antes de la escena de aterrizaje (productVisible=false en las escenas 1 a 3).
- Prohibido: "sígueme para más", abrir nombrando la marca, unboxing, mostrar la etiqueta como tema, música épica de gym como idea central.

TRES REGLAS DE ESCRITURA (no negociables)
1. Prohibido el verbo de folleto: nunca "requiere", "produce", "actúa", "acompaña", "apoya", "contribuye a", "contiene" (en ninguna conjugación). Si una frase podría estar impresa en la caja del producto, no va en el guion. Habla como una amiga que sabe del tema, no como una etiqueta.
2. Al menos una frase del cuerpo le dice algo que ella NO sabía: un mecanismo, una señal concreta o un dato de tiempo (por ejemplo, en qué momento del ciclo pasa algo). Sin dato nuevo el video es un recordatorio, y los recordatorios no se comparten ni se guardan. Cópiala tal cual en newInsight. El dato tiene que ser real y verificable: si no estás segura, no lo uses.
3. Nombra lo que ella SINTIÓ, no solo lo que le pasó: "te sentiste sucia", "pensaste que a ti no te funciona", "hasta te sentiste mal contigo". Va en el cuerpo, alrededor del segundo 10-15: ahí se gana la retención. Cópiala tal cual en feltLine.

EJEMPLO DE TONO (idea: acné en la mandíbula que no se va con skincare)
- Mal (folleto, sin dato, sin emoción): "El acné hormonal tiene causas internas. El skincare actúa en la superficie. Peach Perfect te ayuda a equilibrar tus hormonas."
- Bien: "¿Por qué siempre en la mandíbula y siempre la semana antes de que te baje? Ese patrón es la pista: no empieza en tu piel. Y tú cambiando de crema cada mes, pensando que eras tú la que lo hacía mal."

PROHIBIDO EN TODO EL GUION
- Claims médicos: no cura, no trata, no regulariza, no previene, no elimina. El contenido explica; el producto solo se nombra.
- Prometer resultados en un tiempo ("en 8 semanas vas a ver", "en un mes").
- Datos de producto que no estén en la ficha del documento. Inositol siempre 80:1.

IMÁGENES (para la fase siguiente)
- Las mismas personas en todo el video (campo character, una descripción por personaje) y un estilo visual fijo (campo visualStyle): mujeres mexicanas reales de 20-40 años, en situaciones cotidianas creíbles (casa, baño, cocina, gym de barrio, recámara), luz natural, tonos rosa y durazno sutiles. Nada clínico.
- Los fotogramas siguen el formato: hac a cámara fija; vof b-roll de manos, detalle y producto; pov desde la mano de quien graba; personaje con el cambio de ropa o encuadre de cada personaje; vlog en movimiento; dinamico con encuadres variados; reaccion con ella frente a cámara (la captura del comentario se superpone en edición).
- Cada prompt de fotograma es autosuficiente: repite la descripción de la protagonista y el estilo, en inglés, fotorrealista, vertical 9:16.
- Sin texto, letras ni logos dentro de las imágenes (el texto en pantalla se agrega en edición). Cuando aparezca el bote, descríbelo como un bote rosa de suplemento en polvo sin etiqueta legible.
- El fotograma final de una escena y el inicial de la siguiente deben conectar visualmente.

GUARDRAILS (sección 11 del documento)
- Nunca antes/después de peso corporal, restricción alimentaria, conteo obsesivo ni vergüenza corporal. La marca habla de fuerza y de entender el cuerpo.
- Inositol: solo en polvo con scoop, proporción 80:1 (nunca 40:1), nunca cápsulas.
- No prometas curar, tratar, regularizar ni prevenir nada, ni resultados en un plazo.

DOCUMENTO DE MARCA Y MÉTODO
${brandContext}`;
}

export interface ScriptBrief {
  idea: string;
  product: VideoProduct;
  channel: VideoChannel;
  format?: VideoFormat | "auto" | null;
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
    brief.format && brief.format !== "auto"
      ? `Formato: ${brief.format} (${VIDEO_FORMATS[brief.format].label}), elegido por la revisora. Úsalo y explica en formatReason cómo lo aprovechas para esta idea.`
      : "Formato: auto. Elige con la tabla de selección el que mejor comunique esta idea y explica por qué en formatReason.",
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
