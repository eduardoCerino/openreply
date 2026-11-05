// Video generator settings shared by the server and the panel (no Node APIs
// here, it is imported by client components). The brand context loader is in
// lib/video/config.ts.

export type VideoProduct = "creatina" | "inositol";
export type VideoChannel = "organico" | "pagado";

// Every scene is one 5-second clip rendered from a start and an end frame, so a
// script of N seconds has N/5 scenes, N/5*2 images and N/5 video calls; the
// clips are concatenated into one video afterwards. The duration itself is a
// range per format and tier (see VIDEO_DURATIONS below).
export const CLIP_SECONDS = 5;

// A script normally takes under a minute. After this long in "writing" it is
// treated as lost (usually a worker restart) and can be retried from the panel.
export const STALE_SCRIPT_MS = 4 * 60_000;

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

// ─── Duration ───────────────────────────────────────────────────────────────
// Requested duration: "estandar" is each format's default range, "corto" drops
// any format to 25-30 s, and "auto" uses the default but lets the model fall
// back to corto when it has no second real insight (never inflate to fill).
export type VideoDuration = "auto" | "estandar" | "corto";
export type DurationTier = "estandar" | "corto";

export interface DurationBudget {
  /** Seconds, inclusive; multiples of CLIP_SECONDS. */
  seconds: [number, number];
  /** Spoken words only (~2.8/s): no on-screen text, directions or speaker labels. */
  words: [number, number];
  /** New insights the body must carry: two at ~55 s, one at 30-40 s. */
  insights: 1 | 2;
}

const SHORT_SINGLE_VOICE: DurationBudget = { seconds: [25, 30], words: [65, 75], insights: 1 };
const SHORT_DIALOGUE: DurationBudget = { seconds: [25, 30], words: [50, 60], insights: 1 };

export const VIDEO_DURATIONS: Record<VideoFormat, Record<DurationTier, DurationBudget>> = {
  hac: { estandar: { seconds: [45, 55], words: [125, 155], insights: 2 }, corto: SHORT_SINGLE_VOICE },
  vof: { estandar: { seconds: [45, 55], words: [130, 160], insights: 2 }, corto: SHORT_SINGLE_VOICE },
  dinamico: { estandar: { seconds: [45, 55], words: [120, 150], insights: 2 }, corto: SHORT_SINGLE_VOICE },
  vlog: { estandar: { seconds: [40, 50], words: [105, 135], insights: 2 }, corto: SHORT_SINGLE_VOICE },
  // Dialogue falls apart when stretched, and nobody sits through a minute of
  // answer after reading the comment, so these stay shorter.
  pov: { estandar: { seconds: [30, 40], words: [70, 95], insights: 1 }, corto: SHORT_DIALOGUE },
  personaje: { estandar: { seconds: [30, 40], words: [65, 90], insights: 1 }, corto: SHORT_DIALOGUE },
  reaccion: { estandar: { seconds: [30, 40], words: [70, 90], insights: 1 }, corto: SHORT_SINGLE_VOICE },
};

export function durationBudget(format: VideoFormat, tier: DurationTier): DurationBudget {
  return VIDEO_DURATIONS[format][tier];
}

export const SCENE_WORDS_MAX = 18;

// ─── Voiceover spelling ─────────────────────────────────────────────────────
// The voiceover is read by a TTS voice, so English words are written the way
// they sound in Spanish. Only the LOCUCIÓN layer uses these spellings; on-screen
// text, caption and title always keep the correct written form. Add a row to
// teach the generator a new word; longer phrases first so they win.
export const PHONETIC_SPELLINGS: Array<{ written: string; spoken: string }> = [
  { written: "Peach Perfect", spoken: "pich pérfect" },
  { written: "pre workout", spoken: "pri wórcaut" },
  { written: "scoop", spoken: "scup" },
  { written: "fitness", spoken: "fítnes" },
];

// How the product is named out loud: short, in Spanish, no catalog listing.
export const PRODUCT_SPOKEN_NAMES: Record<VideoProduct, string[]> = {
  creatina: ["la creatina de Peach Perfect", "esta creatina sabor limonada rosa"],
  inositol: ["el inositol de Peach Perfect", "limonada rosa"],
};

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

// ─── CTA ─────────────────────────────────────────────────────────────────────
// Each video writes its own CTA: a comment keyword tied to its topic plus what
// she gets for it. The keyword is what an OpenReply comment-to-DM campaign
// listens for (matching ignores case and accents), so every new keyword needs
// its campaign. The reviewer can pin the keyword per video.
// The CTA opens with "Si [the video's pain]…" and trades the comment for a
// micro-solution to the hook's pain: advice, never a link or the product.
export const CTA_EXAMPLES: Record<VideoProduct, string[]> = {
  creatina: [
    "Si quieres empezar, escríbeme GLÚTEOS aquí abajo y te digo cómo.",
    "Si la dejaste por lo mismo, escríbeme CREATINA y te digo cómo tomarla bien.",
  ],
  inositol: [
    "Si te pasa igual, escríbeme INOSITOL y te digo en qué momento tomarlo.",
    "Si sientes eso, escríbeme DULCE y te explico por qué no es falta de voluntad.",
  ],
};

// What the micro-solution may be: one concrete piece of advice the DM can give.
export const CTA_OFFERS = [
  "cómo empezar",
  "cómo tomarlo bien",
  "en qué momento tomarlo",
  "por qué le pasa lo que el video describe",
  "el error que lo está frenando",
];

// Never a link, generic info or the product itself, and nothing the brand
// does not make (discounts, gifts, downloads).
export const CTA_FORBIDDEN_OFFERS = [
  "link", "liga", "info", "informacion", "precio", "el producto",
  "descuento", "cupon", "codigo de descuento", "regalo", "gratis", "envio gratis",
  "sorteo", "pdf", "ebook", "e book", "guia gratis", "muestra",
];

/** One word, letters only, 3-14 characters: easy to type in a comment. */
export const CTA_KEYWORD_PATTERN = /^[A-ZÁÉÍÓÚÜÑ]{3,14}$/;

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

// ─── Idea checklist (runs BEFORE writing) ───────────────────────────────────
// Viral video = winning idea, always: no format, camera or edit saves a bad
// one. An idea needs IDEA_MIN_SCORE of the 8 filters or no script is written.
export const IDEA_FILTERS = [
  { id: "contracorriente", label: "Contracorriente", test: "Contradice lo que ella cree hoy." },
  {
    id: "filtro550",
    label: "Filtro 5-50",
    test: "Lo entiende alguien sin contexto y le interesaría a 50 de cada 100 mujeres al azar.",
  },
  { id: "unicidad", label: "Unicidad", test: "No es el video que ya hicieron 40 cuentas de suplementos." },
  {
    id: "aplicable",
    label: "Aplicable a gente común",
    test: "No requiere saber de entrenamiento ni de hormonas.",
  },
  { id: "polemico", label: "Polémico", test: "Genera debate o desacuerdo en comentarios." },
  { id: "formato", label: "Formato adecuado", test: "Existe un formato que lo comunica rápido y visual." },
  {
    id: "personaje",
    label: "Personaje de marca congruente",
    test: "Es coherente con quien habla (una mujer real que entiende su cuerpo, no una vendedora).",
  },
  {
    id: "referencia",
    label: "Referencia viral existente",
    test: "Esa idea ya funcionó en otro idioma o nicho.",
  },
] as const;

export type IdeaFilterId = (typeof IDEA_FILTERS)[number]["id"];
export const IDEA_MIN_SCORE = 5;

// ─── Awareness level ────────────────────────────────────────────────────────
// Reels are written for levels 0-2. Levels 3-4 (formula, dose, certifications,
// brand vs brand) speak to ~5% of the market: never a reel.
export type AwarenessLevel = "0" | "1" | "2";
export type AwarenessParam = AwarenessLevel | "auto";

export const AWARENESS_LEVELS: Record<
  AwarenessLevel,
  { label: string; state: string; share: string; content: string; example: string }
> = {
  "0": {
    label: "Nivel 0",
    state: "No sabe que tiene un problema",
    share: "~40%",
    content: "Entretenido, contracorriente. Ni menciona la categoría del producto.",
    example: "3 cosas que te hacen ver hinchada y no son la comida",
  },
  "1": {
    label: "Nivel 1",
    state: "Sabe que tiene el problema, no cómo resolverlo",
    share: "~40%",
    content: "Nombra el problema con sus palabras. Zona principal.",
    example: "Por qué entrenas pierna y tus glúteos siguen igual",
  },
  "2": {
    label: "Nivel 2",
    state: "Sabe cómo se soluciona",
    share: "~15%",
    content: "Comparativa, por qué esta fórmula. Más para historias que para reels.",
    example: "Por qué 80:1 y no 40:1",
  },
};
export const DEFAULT_AWARENESS: AwarenessParam = "1";

// ─── Independent piece ──────────────────────────────────────────────────────
// Every video reaches people who never saw the account: nothing that assumes a
// previous video. Matched on accent-free lowercase text.
export const SERIES_PHRASES = [
  "como les conte",
  "como les dije",
  "como te conte",
  "como te dije",
  "parte 2",
  "parte dos",
  "segunda parte",
  "ya saben que",
  "en el video anterior",
  "en mi ultimo video",
  "en el ultimo video",
  "si viste mi video",
];

// ─── Part 4a: bridge line ───────────────────────────────────────────────────
// The bridge talks about the problem and where to work on it, never about what
// the product does, and stays true with the product deleted.
export const BRIDGE_PATTERNS = [
  "Si el problema es [X], ahí es donde hay que trabajar.",
  "Por eso lo que tomo no es [lo obvio], es [categoría].",
  "Y para eso el ingrediente que importa es [X], no [lo que todas buscan].",
  "Eso no se arregla por fuera. Se trabaja por dentro.",
  "Por eso yo dejé de buscar [X] y empecé a buscar [Y] en la etiqueta.",
];

// Body-effect and label verbs banned in the bridge (on top of the global
// brochure verbs and promise checks).
export const BRIDGE_FORBIDDEN = [
  "regula", "regular", "equilibra", "equilibrar", "corrige", "corregir",
  "mejora", "mejorar", "controla", "controlar", "normaliza", "normalizar",
  "contiene", "aporta", "aportar", "actua", "apoya", "contribuye",
];
