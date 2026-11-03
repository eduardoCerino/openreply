// Cover image style for blog articles. Every prompt is
// CONSTANTES (the brand's visual family) + ESCENA (from the article topic) +
// VARIABLES (surface, props, angle, color), so covers look like one brand but
// never like copies. Edit the lists below to change the options.

export const IMAGE_CONSTANTS =
  "Fotografía editorial flat lay, estética premium de bienestar femenino, paleta cálida en tonos rosa, coral, durazno y crema, luz natural suave, sombras delicadas, composición limpia con espacio negativo para texto. Aspecto de fotografía profesional real, texturas auténticas, grano sutil, nada digital ni artificial. Formato horizontal 16:9. Sin personas, sin texto, sin logos, sin elementos clínicos ni médicos.";

export const IMAGE_SURFACES = [
  "mármol claro con vetas rosas",
  "lino beige",
  "papel texturizado crema",
  "superficie rosa durazno",
  "madera clara",
  "cerámica mate rosada",
  "terracota suave",
] as const;

export const IMAGE_PROPS = [
  "flores frescas",
  "hojas verdes",
  "vaso con bebida rosada",
  "scoop con polvo",
  "frutas (durazno, frambuesa, limón rosa)",
  "tela de lino arrugada",
  "pétalos sueltos",
] as const;

export const IMAGE_ANGLES = [
  "cenital perfecto",
  "ligeramente en diagonal",
  "composición descentrada",
  "close-up parcial",
] as const;

export const IMAGE_COLOR_INTENSITIES = [
  "colores pastel y aireados, alta luminosidad",
  "colores más saturados y cálidos, dentro de la misma paleta",
] as const;

export interface ImageStyle {
  surface: string;
  props: string[];
  angle: string;
  colorIntensity: string;
}

type Random = () => number;

function pick<T>(options: readonly T[], random: Random, avoid?: T): T {
  // The anti-repetition rule: never the same surface or angle as the previous
  // cover. Falls back to the full list if a list ever has one option.
  const pool = options.length > 1 ? options.filter((option) => option !== avoid) : options;
  return pool[Math.floor(random() * pool.length)];
}

function pickProps(random: Random, previous?: string[]): string[] {
  const count = random() < 0.5 ? 2 : 3;
  for (let attempt = 0; attempt < 10; attempt++) {
    const pool: string[] = [...IMAGE_PROPS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const shuffled = pool.slice(0, count);
    const same =
      previous &&
      previous.length === shuffled.length &&
      shuffled.every((prop) => previous.includes(prop));
    if (!same) return shuffled;
  }
  return [...IMAGE_PROPS].slice(0, count);
}

/**
 * A fresh combination of VARIABLES. `previous` is the style of the last cover
 * generated (see lastImageStyle in lib/blog/pipeline.ts); its surface and angle
 * are excluded and its exact prop set is not repeated.
 */
export function pickImageStyle(previous: ImageStyle | null, random: Random = Math.random): ImageStyle {
  return {
    surface: pick(IMAGE_SURFACES, random, previous?.surface as (typeof IMAGE_SURFACES)[number]),
    props: pickProps(random, previous?.props),
    angle: pick(IMAGE_ANGLES, random, previous?.angle as (typeof IMAGE_ANGLES)[number]),
    colorIntensity: pick(IMAGE_COLOR_INTENSITIES, random),
  };
}

export function isImageStyle(value: unknown): value is ImageStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as Record<string, unknown>;
  return (
    typeof style.surface === "string" &&
    typeof style.angle === "string" &&
    typeof style.colorIntensity === "string" &&
    Array.isArray(style.props)
  );
}

export function buildCoverPrompt(scene: string, style: ImageStyle): string {
  return [
    IMAGE_CONSTANTS,
    `Escena: ${scene.trim().replace(/\.$/, "")}.`,
    `Superficie: ${style.surface}. Props: ${style.props.join(", ")}. Ángulo y composición: ${style.angle}. Color: ${style.colorIntensity}.`,
    "Recordatorio: sin personas ni manos, sin texto ni letras en ningún objeto o empaque, sin logos ni etiquetas legibles, sin pastillas, jeringas, batas ni nada clínico.",
  ].join("\n\n");
}
