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
