// Video generator settings shared by the server and the panel (no Node APIs
// here, it is imported by client components). The brand context loader is in
// lib/video/config.ts.

export type VideoProduct = "creatina" | "inositol";
export type VideoChannel = "organico" | "pagado";

// 5 scenes x 5 seconds = a 25-second video (the maximum). Each scene is one
// clip rendered from a start and an end frame, so a script needs 10 images and
// 5 video calls; the clips are concatenated into one video afterwards.
export const SCENE_COUNT = 5;
export const CLIP_SECONDS = 5;
export const MAX_VIDEO_SECONDS = SCENE_COUNT * CLIP_SECONDS;

// ─── Video formats ──────────────────────────────────────────────────────────
// The format is chosen by which one communicates the idea best, never by which
// looks more viral. It changes the staging; the word budget below is shared.

export type VideoFormat =
  | "hac"
  | "vof"
  | "pov"
  | "personaje"
  | "vlog"
  | "dinamico"
  | "reaccion";

export interface VideoFormatSpec {
  id: VideoFormat;
  label: string;
  description: string;
  bestFor: string;
  production: string;
  /** Two or more voices: hook is a line of dialogue, lines carry speakers. */
  dialogue: boolean;
}

export const VIDEO_FORMATS: Record<VideoFormat, VideoFormatSpec> = {
  hac: {
    id: "hac",
    label: "HAC · Hablando a cámara",
    description: "Ella habla directo al espectador, contacto visual, una sola toma.",
    bestFor: "explicar un mecanismo, contar una historia, confesión personal",
    production: "1 persona, cámara fija. El más barato.",
    dialogue: false,
  },
  vof: {
    id: "vof",
    label: "VOF · Voz en off",
    description:
      "Narración sobre b-roll: producto, manos, preparación, detalle, cotidiano.",
    bestFor: "dato contraintuitivo, tono íntimo, cuando no hay quién salga en cámara",
    production: "La más flexible. B-roll + locución.",
    dialogue: false,
  },
  pov: {
    id: "pov",
    label: "POV",
    description:
      "Alguien graba desde su perspectiva e interactúa con otra persona. Espontáneo.",
    bestFor: "pregunta incómoda, descubrimiento, «le pregunté a mi amiga del gym»",
    production: "2 personas.",
    dialogue: true,
  },
  personaje: {
    id: "personaje",
    label: "Personaje",
    description:
      "Dos o más personajes en una situación. Pueden ser la misma persona editada.",
    bestFor: "mitos, conflicto, malentendido, la típica que dice X vs la que sabe",
    production: "1-2 personas + cambio de ropa o encuadre.",
    dialogue: true,
  },
  vlog: {
    id: "vlog",
    label: "Vlog",
    description:
      "Documenta una actividad mientras habla: preparando el scoop, saliendo al gym.",
    bestFor: "integrar el producto en lo cotidiano sin que se sienta anuncio",
    production: "1 persona en movimiento.",
    dialogue: false,
  },
  dinamico: {
    id: "dinamico",
    label: "Dinámico",
    description: "Varios encuadres, cortes, texto en pantalla, acercamientos.",
    bestFor: "listas, «3 errores», comparaciones, explicación visual",
    production: "La más cara en edición.",
    dialogue: false,
  },
  reaccion: {
    id: "reaccion",
    label: "Reacción (a comentario propio)",
    description:
      "Captura de un comentario o DM de su propia audiencia en pantalla; ella responde.",
    bestFor: "objeción directa, duda repetida, la pregunta que todas hacen",
    production: "1 persona. Contenido infinito y gratis.",
    dialogue: false,
  },
};

export const VIDEO_FORMAT_IDS = Object.keys(VIDEO_FORMATS) as VideoFormat[];

// Selection table for `auto`: idea type → best formats, first is preferred.
export const FORMAT_SELECTION: Array<{ idea: string; formats: VideoFormat[] }> = [
  { idea: "Mito o creencia falsa («la creatina te infla»)", formats: ["personaje", "reaccion"] },
  { idea: "Explicar un mecanismo («por qué es hormonal»)", formats: ["hac", "dinamico"] },
  { idea: "Lista o varios errores", formats: ["dinamico"] },
  { idea: "Confesión / lo que ella sintió", formats: ["hac", "vof"] },
  { idea: "Pregunta incómoda o descubrimiento", formats: ["pov"] },
  { idea: "Producto en lo cotidiano", formats: ["vlog"] },
  { idea: "Dato contraintuitivo con b-roll", formats: ["vof"] },
  { idea: "Objeción que ya le hicieron", formats: ["reaccion"] },
];

// Conversational Spanish runs ~2.8 words/s, so 25 s holds ~70 words. Scripts
// below the floor are padding-free but too thin; above the cap they get rushed.
export const SCRIPT_WORDS_MIN = 60;
export const SCRIPT_WORDS_MAX = 75;
export const SCENE_WORDS_MAX = 18;

// Label-copy verbs (rule 1). If a sentence could be printed on the box, it
// does not belong in the script. Matched as whole words on accent-free text.
export const BROCHURE_VERBS = [
  "requiere", "requieren",
  "produce", "producen",
  "actua", "actuan",
  "acompana", "acompanan",
  "apoya", "apoyan", "apoyar",
  "contribuye", "contribuyen", "contribuir",
  "contiene", "contienen",
] as const;

// The fixed close (method section 7: the CTA is part of the template, never
// reinvented). The keyword is the one to set on the OpenReply comment-to-DM
// campaign so the comment turns into a DM with the product link.
export const VIDEO_CTA: Record<VideoProduct, { keyword: string; line: string }> = {
  creatina: { keyword: "GLÚTEOS", line: "Comenta GLÚTEOS y te mando el link" },
  inositol: { keyword: "SOP", line: "Escríbeme SOP y te paso la fórmula completa" },
};

// The 8 hook molds of method section 6.
export const HOOK_MOLDS = [
  "Por qué [síntoma] — y no es lo que crees.",
  "[Problema] no se arregla donde crees.",
  "Mito vs realidad: [creencia].",
  "El error nº__ que te hace [consecuencia].",
  "Si [síntoma cotidiano], esto es lo que nadie te explicó.",
  "3 cosas que reviso antes de recomendarle [producto] a una mujer.",
  "Lo que nadie te cuenta sobre [tema] después de los 25.",
  "3 frases que usan para [venderte un suplemento que no sirve].",
] as const;
