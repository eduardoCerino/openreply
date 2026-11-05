import type { VideoProject } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { normalizeText, type QualityCheck } from "@/lib/blog/html";
import { generateStructured } from "@/lib/blog/openai";
import {
  BRIDGE_FORBIDDEN,
  BROCHURE_VERBS,
  CLIP_SECONDS,
  PHONETIC_SPELLINGS,
  SCENE_WORDS_MAX,
  SERIES_PHRASES,
  CTA_FORBIDDEN_OFFERS,
  CTA_KEYWORD_PATTERN,
  VIDEO_FORMATS,
  VIDEO_FORMAT_IDS,
  durationBudget,
  getBrandContext,
  type AwarenessLevel,
  type AwarenessParam,
  type HookVoice,
  type HookVoiceParam,
  type DurationTier,
  type VideoChannel,
  type VideoDuration,
  type VideoFormat,
  type VideoProduct,
} from "@/lib/video/config";
import { checkIdea, type IdeaCheck } from "@/lib/video/idea-check";
import {
  SCENE_SECTIONS,
  SCRIPT_SCHEMA,
  buildScriptInput,
  buildScriptInstructions,
  type VideoScript,
} from "@/lib/video/prompt";

const MAX_ATTEMPTS = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Terms the method keeps out of the first 3 seconds: brand and technical
// vocabulary (method sections 4 and 5).
const HOOK_FORBIDDEN = [
  "peach perfect",
  "pich perfect",
  "myo",
  "d chiro",
  "80 1",
  "monohidratada",
  " mg",
  "bcaa",
  "colageno",
  "dim ",
];

// Anything the brand doc forbids outright, anywhere in the script.
const SCRIPT_FORBIDDEN: Array<{ term: string; why: string }> = [
  { term: "sigueme", why: "CTA prohibido «sígueme para más»" },
  { term: "capsula", why: "el inositol no tiene cápsulas" },
  { term: "40 1", why: "la proporción es 80:1, nunca 40:1" },
  { term: "antes y despues", why: "nada de antes/después" },
];

// The product is named, never credited with an effect.
// Effects claimed for the product itself, said to her ("te ayuda", "regula").
// Her own first-person result ("mis glúteos por fin responden") is a
// testimonial and allowed.
const PRODUCT_EFFECT = /\b(ayuda|ayudan|ayudar|ayudarte|mejora|mejoran|mejorar|regula|equilibra|equilibrar|regulariza|reduce|reducir|aumenta|aumentar|hace que|te da|te dara|te devuelve)\b/;

// Part 4b is lived experience, not a spec sheet.
const PRODUCT_SPECS = /\b(\d+ ?(g|gr|mg|mcg)|gramos?|miligramos?|monohidratada|80 1|myo|d chiro|dim|zinc|magnesio|bcaa|bcaas|colageno|nsf|gmp|certificad[ao]s?)\b/;


// No medical claims anywhere in the script ("se trata de" is ordinary speech,
// so only "trata/tratar + object" counts).
const MEDICAL_CLAIM = /\b(cura|curar|curo|regulariza|regularizar|regularizo|regulo|previene|prevenir|elimina|elimino|eliminar|tratar? (el|la|los|las|tu|tus))\b/;

// No results promised in a time frame ("en 8 semanas vas a ver"). A time
// reference alone is fine — rule 2 asks for time data ("la semana antes de que
// te baje") — so it only counts next to a result promise in the same sentence.
const TIME_FRAME = /\b(en|a las|despues de) (\d+|un|una|dos|tres|cuatro|seis|ocho|doce) (dia|dias|semana|semanas|mes|meses)\b/;
const RESULT_PROMISE = /\b(vas a ver|veras|vas a notar|notaras|resultados|cambios|funciona|funcionara)\b/;

function timePromise(texts: string[]): string | null {
  for (const sentence of texts.join(". ").split(/[.?!]+/)) {
    const normalized = normalizeText(sentence);
    if (TIME_FRAME.test(normalized) && RESULT_PROMISE.test(normalized)) return sentence.trim();
  }
  return null;
}

const BROCHURE = new RegExp(`\\b(${BROCHURE_VERBS.join("|")})\\b`);
const BRIDGE_VERB = new RegExp(`\\b(${BRIDGE_FORBIDDEN.join("|")})\\b`);
// A bridge that names the product is a sales line, not a consequence of the
// lesson: it must read true with the product deleted.
const BRIDGE_PRODUCT = /\b(pich perfect|peach perfect|bote|scup|scoop|limonada rosa)\b/;
const BRIDGE_PROMISE = /\b(vas a ver|veras|vas a notar|notaras|te va a|te van a|resultados|funciona|funcionara)\b/;
// The hook is a lived experience, never an ad question (except in reactions,
// where the on-screen comment is the follower's own question).
const HOOK_RHETORICAL = /\b(te pasa|te ha pasado|te paso|sabias que|alguna vez|te suena|eres de las)\b/;
// First-person markers: what she did or felt, said by her.
const FIRST_PERSON = /\b(yo|me|mi|mis|tome|deje|llevo|llevaba|estaba|pense|empece|probe|compre|hice|tire|descubri|tuve|senti|vi|fui|era|cambie|gaste|segui)\b/;
// Second person: talks to her about her problem ("haces", "tus glúteos").
const SECOND_PERSON = /\b(tu|tus|te|ti|contigo|haces|llevas|llevabas|tienes|sientes|estas|eres|quieres|tomas|tomaste|dejaste|probaste|entrenas|comes|gastaste|cambiaste|hiciste|sigues|buscas)\b/;

// A hook's second sentence must announce a concrete missing piece; these
// stock phrases tease nothing and do not stop the scroll.
const VAGUE_HOOK = /\b(el problema (era|es|podria ser|puede ser) otro|es otra cosa|era otra cosa|no es lo que (crees|piensas|imaginas)|hay algo mas|la respuesta te va a sorprender)\b/;

// The testimonial must carry a physical result: a body area or outcome plus a
// change ("mis glúteos por fin empezaron a responder"). A change of mind alone
// ("dejé de pensar que…") is not a result.
const BODY_OUTCOME = /\b(gluteos?|musculos?|fuerza|serie|series|piernas?|piel|acne|granos|mandibula|barbilla|ciclo|regla|periodo|antojos?|hambre|energia|cansancio|cuerpo|cadera|abdomen|hinchazon|cabello|vello)\b/;
const CHANGE_MARKER = /\b(por fin|empez\w*|ya no|ya se|ahora|cambi\w*|respond\w*|crec\w*|not\w*|se ve\w*|se siente\w*|dejo de|dejaron de|mas (fuerte|firmes?|tranquila|estable|redond\w*))\b/;

// Talking to the 3-4 awareness levels (brand vs brand, certifications).
const LEVEL_34 = /\b(vs|versus|otras marcas|otra marca|la competencia|certificad[ao]s?|nsf|gmp)\b/;

// Second-person talk about the condition gets paid ads rejected (section 11).
const PAID_SECOND_PERSON = /\b(tienes|tu|tú|te)\b[^.?!]{0,40}\b(sop|somp|ovario|acne|acné|hormonas?|periodo|regla|ciclo)\b/i;

// ─── Two layers: LOCUCIÓN (phonetic) and written text ───────────────────────

const ACCENTS: Record<string, string> = { a: "[aá]", e: "[eé]", i: "[ií]", o: "[oó]", u: "[uúü]" };

function looseSource(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[aeiou]/g, (vowel) => ACCENTS[vowel])
    .replace(/\s+/g, "[\\s-]+");
}

// Whole-word, case- and accent-insensitive matchers in both directions.
const TO_SPOKEN = PHONETIC_SPELLINGS.map((row) => ({
  pattern: new RegExp(`(?<![\\p{L}])${looseSource(row.written)}(?![\\p{L}])`, "giu"),
  replacement: row.spoken,
}));
const TO_WRITTEN = PHONETIC_SPELLINGS.map((row) => ({
  pattern: new RegExp(`(?<![\\p{L}])${looseSource(row.spoken)}(?![\\p{L}])`, "giu"),
  replacement: row.written,
}));

/** Voiceover spelling for the TTS voice: "Peach Perfect" → "pich pérfect". */
export function toSpoken(text: string): string {
  return TO_SPOKEN.reduce((value, rule) => value.replace(rule.pattern, rule.replacement), text);
}

/** Written spelling for anything on screen: "pich pérfect" → "Peach Perfect". */
export function toWritten(text: string): string {
  return TO_WRITTEN.reduce((value, rule) => value.replace(rule.pattern, rule.replacement), text);
}

// Catalog-sheet naming read aloud (rule: name the product short, in Spanish).
const CATALOG_TERMS = ["pich perfect", "limonada rosa", "en polvo", "mexico", "multivitamin", "pink lemonade", "pink lemon"];

/**
 * Timings come from the template, not the model: 0-5, 5-10, ... 20-25. The
 * spoken text of each scene is joined from its lines, and a format the
 * reviewer chose wins over whatever the model reports.
 */
/** "#glúteos " → "GLÚTEOS": what the comment has to say, as one word. */
export function normalizeCtaKeyword(value: string): string {
  return value.trim().replace(/^#+/, "").trim().toUpperCase();
}

// Hard cap so a runaway response cannot produce dozens of clips.
const MAX_SCENES = 14;

export function normalizeScript(
  script: VideoScript,
  requiredFormat?: VideoFormat,
  requiredTier?: DurationTier,
  requiredAwareness?: AwarenessLevel,
  requiredCtaKeyword?: string | null,
  requiredHookVoice?: HookVoice
): VideoScript {
  const format =
    requiredFormat ?? (VIDEO_FORMAT_IDS.includes(script.format) ? script.format : "hac");
  const durationTier: DurationTier =
    requiredTier ?? (script.durationTier === "corto" ? "corto" : "estandar");
  const scenes = script.scenes.slice(0, MAX_SCENES);
  // The spoken layer gets the phonetic spelling and everything visible the
  // correct one, whatever the model wrote, so the two never mix.
  return {
    ...script,
    format,
    durationTier,
    // The real length is what the scenes add up to, not what the model says.
    targetSeconds: scenes.length * CLIP_SECONDS,
    awarenessLevel:
      requiredAwareness ??
      (["0", "1", "2"].includes(script.awarenessLevel) ? script.awarenessLevel : "1"),
    ctaKeyword: normalizeCtaKeyword(requiredCtaKeyword || script.ctaKeyword || ""),
    bridgeLine: toSpoken(script.bridgeLine ?? ""),
    productLine: toSpoken(script.productLine ?? ""),
    bridgeTest: toWritten(script.bridgeTest ?? ""),
    hookVoice: requiredHookVoice ?? (script.hookVoice === "primera" ? "primera" : "segunda"),
    title: toWritten(script.title),
    hook: toSpoken(script.hook),
    newInsight: toSpoken(script.newInsight ?? ""),
    secondInsight: toSpoken(script.secondInsight ?? ""),
    feltLine: toSpoken(script.feltLine ?? ""),
    cta: toSpoken(script.cta),
    caption: toWritten(script.caption),
    storyFollowUps: (script.storyFollowUps ?? []).map(toWritten),
    onScreenComment: format === "reaccion" ? toWritten((script.onScreenComment ?? "").trim()) : "",
    hashtags: script.hashtags.map((tag) => `#${toWritten(tag).replace(/^#+/, "").replace(/\s+/g, "")}`),
    scenes: scenes.map((scene, index) => {
      const lines = (scene.lines ?? []).map((line) => ({
        speaker: line.speaker.trim(),
        text: toSpoken(line.text.trim()),
        direction: line.direction.trim().replace(/^\[|\]$/g, ""),
      }));
      return {
        ...scene,
        onScreenText: toWritten(scene.onScreenText ?? ""),
        visual: toWritten(scene.visual ?? ""),
        lines,
        voiceover: lines.length ? lines.map((line) => line.text).join(" ") : scene.voiceover ?? "",
        startSecond: index * CLIP_SECONDS,
        endSecond: (index + 1) * CLIP_SECONDS,
      };
    }),
  };
}

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function runScriptChecks(
  script: VideoScript,
  product: VideoProduct,
  channel: VideoChannel,
  {
    previousFormat,
    requiredCtaKeyword,
    requiredHookVoice,
  }: {
    previousFormat?: VideoFormat | null;
    requiredCtaKeyword?: string | null;
    requiredHookVoice?: HookVoice;
  } = {}
): QualityCheck[] {
  const scenes = script.scenes;
  const first = scenes[0];
  const last = scenes[scenes.length - 1];
  // Part 4 (solucion) is where the product may appear; everything before it is
  // hook, context and lesson.
  const landingIndex = scenes.findIndex((scene) => scene.section === "solucion");
  const sectionOrder = scenes.map((scene) => SCENE_SECTIONS.indexOf(scene.section));
  const ordered = sectionOrder.every((order, index) => order >= 0 && (index === 0 || order >= sectionOrder[index - 1]));
  const missingParts = SCENE_SECTIONS.filter((section) => !scenes.some((scene) => scene.section === section));
  const textOf = (section: string) =>
    scenes
      .filter((scene) => scene.section === section)
      .map((scene) => normalizeText(scene.voiceover))
      .join(" ");
  const contextText = textOf("contexto");
  const solutionText = textOf("solucion");
  const contains = (haystack: string, line: string) =>
    Boolean(normalizeText(line)) && haystack.includes(normalizeText(line));
  const bridge = normalizeText(script.bridgeLine ?? "");
  const productLine = normalizeText(script.productLine ?? "");
  const hookText = ` ${normalizeText(`${script.hook} ${first?.voiceover ?? ""} ${first?.onScreenText ?? ""}`)} `;
  const fullText = normalizeText(
    [
      script.hook,
      script.cta,
      script.caption,
      ...scenes.flatMap((scene) => [scene.voiceover, scene.onScreenText]),
    ].join(" ")
  );
  const keyword = script.ctaKeyword ?? "";
  const lastText = normalizeText(last?.voiceover ?? "");
  const ctaText = normalizeText(`${last?.voiceover ?? ""} ${script.cta}`);
  const ctaOpensWithIf = /^si\b/.test(lastText) || /^si\b/.test(normalizeText(script.cta ?? ""));
  const productSpec = productLine.match(PRODUCT_SPECS)?.[0];
  const badOffer = CTA_FORBIDDEN_OFFERS.find((offer) => ` ${ctaText} `.includes(` ${offer} `));
  const budget = durationBudget(script.format, script.durationTier);
  const [wordsMin, wordsMax] = budget.words;
  const seconds = scenes.length * CLIP_SECONDS;
  const formatName = VIDEO_FORMATS[script.format].label.split(" · ")[0];
  const durationName = script.durationTier === "corto" ? "corto" : "estándar";
  const longScenes = scenes
    .map((scene, index) => ({ index, count: words(scene.voiceover) }))
    .filter((scene) => scene.count > SCENE_WORDS_MAX);
  const totalWords = scenes.reduce((sum, scene) => sum + words(scene.voiceover), 0);
  const voice = scenes.map((scene) => normalizeText(`${scene.voiceover} ${scene.onScreenText}`));
  // The reveal belongs to the lesson (part 3): insights and the felt line live
  // there, and the context must not give them away early.
  const lesson = textOf("moraleja");
  const inBody = (line: string) => contains(lesson, line);
  const revealedEarly = [script.newInsight, script.secondInsight].filter((line) => contains(contextText, line));
  const series = SERIES_PHRASES.filter((phrase) => fullText.includes(phrase));
  const hookLine = script.format === "reaccion" ? "" : script.hook ?? "";
  const hookNormalized = normalizeText(hookLine);
  const hookIsQuestion = /[¿?]/.test(hookLine) || HOOK_RHETORICAL.test(hookNormalized);
  const hookVoiceMatches =
    script.hookVoice === "primera" ? FIRST_PERSON.test(hookNormalized) : SECOND_PERSON.test(hookNormalized);
  const hookSentences = hookLine.split(/(?<=[.!…])\s+/).map((part) => part.trim()).filter(Boolean);
  const brochureHits = voice
    .map((text, index) => ({ index, match: text.match(BROCHURE)?.[1] }))
    .filter((hit) => hit.match);
  const productScenes = scenes
    .map((scene, index) => ({ index, text: normalizeText(scene.voiceover) }))
    .filter(({ index }) => index >= Math.max(landingIndex, 0) && landingIndex !== -1);
  const effectHits = productScenes.filter(({ text }) => PRODUCT_EFFECT.test(text));
  const promise = timePromise([
    script.caption,
    script.cta,
    ...scenes.flatMap((scene) => [scene.voiceover, scene.onScreenText]),
  ]);
  const forbidden = SCRIPT_FORBIDDEN.filter(({ term }) => fullText.includes(term));
  const spoken = scenes.map((scene) => normalizeText(scene.voiceover)).join(" ");
  const namingHits = [
    /\bpink\b|\blemonade\b/.test(spoken) ? "«Pink Lemonade» en la locución (se dice limonada rosa)" : null,
    /\bmexico\b/.test(spoken) ? "«México» en la locución" : null,
  ].filter((hit): hit is string => Boolean(hit));
  const catalogHits = scenes
    .flatMap((scene) => scene.voiceover.split(/[.?!]+/))
    .filter((sentence) => {
      const text = ` ${normalizeText(sentence)} `;
      return CATALOG_TERMS.filter((term) => text.includes(` ${term} `)).length >= 3;
    })
    .map((sentence) => sentence.trim());
  const earlyProduct = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene, index }) => scene.productVisible && (landingIndex === -1 || index < landingIndex));

  const checks: QualityCheck[] = [
    {
      id: "duration",
      label: `${budget.seconds[0]}-${budget.seconds[1]} s (${durationName}) en escenas de ${CLIP_SECONDS} s`,
      ok: seconds >= budget.seconds[0] && seconds <= budget.seconds[1],
      detail: `${seconds} s · ${scenes.length} escenas`,
      hard: seconds < budget.seconds[0] || seconds > budget.seconds[1],
    },
    {
      id: "structure",
      label: "5 partes en orden: gancho → contexto → moraleja → solución → CTA",
      ok: first?.section === "gancho" && last?.section === "cta" && ordered && missingParts.length === 0,
      detail: missingParts.length ? `falta: ${missingParts.join(", ")}` : ordered ? undefined : "partes fuera de orden",
      hard: !(first?.section === "gancho" && last?.section === "cta" && ordered && missingParts.length === 0),
    },
    ...(script.format === "reaccion"
      ? []
      : [
          {
            id: "hookStory",
            label: "Gancho como historia, sin pregunta retórica",
            ok: !hookIsQuestion,
            detail: hookIsQuestion ? `«${hookLine}» suena a pregunta de anuncio` : undefined,
            hard: hookIsQuestion,
          } satisfies QualityCheck,
          {
            id: "hookVoice",
            label:
              script.hookVoice === "primera"
                ? "Gancho en primera persona (experiencia resuelta)"
                : "Gancho en segunda persona (nombra su problema)",
            ok: hookVoiceMatches,
            detail: requiredHookVoice ? `pedida por ti: ${requiredHookVoice} persona` : undefined,
            // Only a requirement when the reviewer picked the voice.
            hard: Boolean(requiredHookVoice) && !hookVoiceMatches,
          } satisfies QualityCheck,
          {
            id: "hookSpecific",
            label: "Segunda oración del gancho específica, no vaga",
            ok: !VAGUE_HOOK.test(hookNormalized),
            detail: VAGUE_HOOK.test(hookNormalized)
              ? `«${hookNormalized.match(VAGUE_HOOK)?.[0]}» no genera curiosidad: anuncia la pieza concreta que falta`
              : undefined,
            hard: VAGUE_HOOK.test(hookNormalized),
          } satisfies QualityCheck,
          {
            id: "hookCuriosity",
            label: "Segunda oración corta que genera curiosidad",
            ok: hookSentences.length >= 2 && words(hookSentences[hookSentences.length - 1]) <= 14,
            detail: hookSentences.length < 2 ? "el gancho tiene una sola oración" : undefined,
          } satisfies QualityCheck,
        ]),
    {
      id: "intrigue",
      label: "El contexto genera intriga sin revelar el dato",
      ok: revealedEarly.length === 0,
      detail: revealedEarly.length ? "el dato nuevo aparece en el contexto; va en la moraleja" : undefined,
      hard: revealedEarly.length > 0,
    },
    {
      id: "bridge",
      label: "Solución con frase puente (4a) antes del producto (4b)",
      ok:
        contains(solutionText, script.bridgeLine) &&
        contains(solutionText, script.productLine) &&
        solutionText.indexOf(bridge) < solutionText.indexOf(productLine),
      detail: !script.bridgeLine
        ? "falta la frase puente"
        : !contains(solutionText, script.bridgeLine)
          ? "la frase puente no está en la solución"
          : !contains(solutionText, script.productLine)
            ? "la frase del producto no está en la solución"
            : undefined,
      hard: true,
    },
    {
      id: "bridgeClaim",
      label: "La frase puente no atribuye efecto ni promete",
      ok: !BRIDGE_VERB.test(bridge) && !BRIDGE_PROMISE.test(bridge) && !BROCHURE.test(bridge),
      detail: bridge.match(BRIDGE_VERB)?.[1] ?? bridge.match(BRIDGE_PROMISE)?.[1] ?? bridge.match(BROCHURE)?.[1],
      hard: BRIDGE_VERB.test(bridge) || BRIDGE_PROMISE.test(bridge) || BROCHURE.test(bridge),
    },
    {
      id: "bridgeStandsAlone",
      label: "La frase puente sigue siendo verdadera sin el producto",
      ok: Boolean(bridge) && !BRIDGE_PRODUCT.test(bridge) && Boolean(script.bridgeTest?.trim()),
      detail: BRIDGE_PRODUCT.test(bridge)
        ? `nombra el producto («${bridge.match(BRIDGE_PRODUCT)?.[1]}»): es un claim disfrazado`
        : script.bridgeTest?.trim() || undefined,
      hard: !bridge || BRIDGE_PRODUCT.test(bridge),
    },
    {
      id: "independent",
      label: "Pieza independiente (sin «parte 2», «como les conté»…)",
      ok: series.length === 0,
      detail: series.map((phrase) => `«${phrase}»`).join(", ") || undefined,
      hard: series.length > 0,
    },
    {
      id: "awareness",
      label: `Escrito para el nivel de conciencia ${script.awarenessLevel}, nunca 3-4`,
      ok: !LEVEL_34.test(fullText),
      detail: LEVEL_34.test(fullText) ? `«${fullText.match(LEVEL_34)?.[1]}» le habla al nivel 3-4` : undefined,
    },
    ...(previousFormat
      ? [
          {
            id: "newFormat",
            label: "Idea validada: formato distinto al anterior",
            ok: script.format !== previousFormat,
            detail: `anterior: ${previousFormat} · nuevo: ${script.format}`,
            hard: script.format === previousFormat,
          } satisfies QualityCheck,
        ]
      : []),
    {
      id: "hook",
      label: "Gancho sin marca, producto técnico ni tecnicismos",
      ok: !HOOK_FORBIDDEN.some((term) => hookText.includes(term)),
      hard: hookText.includes("peach perfect"),
    },
    {
      id: "product",
      label: "El bote no aparece antes de la solución",
      ok: earlyProduct.length === 0,
      detail: earlyProduct.length ? `escena ${earlyProduct.map((e) => e.index + 1).join(", ")}` : undefined,
      hard: earlyProduct.length > 0,
    },
    {
      id: "cta",
      label: keyword ? `CTA con palabra clave ${keyword} en la última escena` : "CTA con palabra clave",
      ok: Boolean(keyword) && lastText.includes(normalizeText(keyword)),
      detail: !keyword
        ? "falta la palabra clave"
        : !lastText.includes(normalizeText(keyword))
          ? "la palabra clave no se dice en la escena cta"
          : undefined,
      hard: !keyword || !lastText.includes(normalizeText(keyword)),
    },
    {
      id: "ctaKeyword",
      label: "Palabra clave de una sola palabra, 3-14 letras",
      ok: CTA_KEYWORD_PATTERN.test(keyword),
      detail: keyword || undefined,
      hard: !CTA_KEYWORD_PATTERN.test(keyword),
    },
    ...(requiredCtaKeyword
      ? [
          {
            id: "ctaKeywordRequested",
            label: "Usa la palabra clave pedida",
            ok: keyword === normalizeCtaKeyword(requiredCtaKeyword),
            detail: `pedida: ${normalizeCtaKeyword(requiredCtaKeyword)}`,
            hard: keyword !== normalizeCtaKeyword(requiredCtaKeyword),
          } satisfies QualityCheck,
        ]
      : []),
    {
      id: "ctaOffer",
      label: "El CTA promete una micro-solución, no un link ni el producto",
      ok: !badOffer,
      detail: badOffer ? `«${badOffer}»: promete un consejo que resuelva el dolor del gancho` : undefined,
      hard: Boolean(badOffer),
    },
    {
      id: "ctaOpening",
      label: "El CTA abre con «Si [contexto del dolor]…»",
      ok: ctaOpensWithIf,
      hard: !ctaOpensWithIf,
    },
    {
      id: "productSpecs",
      label: "El producto aparece como experiencia, sin características técnicas",
      ok: !productSpec,
      detail: productSpec ? `«${productSpec}» es ficha técnica` : undefined,
      hard: Boolean(productSpec),
    },
    {
      id: "productResult",
      label: "El testimonio trae un resultado físico",
      ok: BODY_OUTCOME.test(productLine) && CHANGE_MARKER.test(productLine),
      detail:
        BODY_OUTCOME.test(productLine) && CHANGE_MARKER.test(productLine)
          ? undefined
          : "solo un cambio mental o una mención; agrega el beneficio en el cuerpo que prometió el gancho",
      hard: !(BODY_OUTCOME.test(productLine) && CHANGE_MARKER.test(productLine)),
    },
    {
      id: "productVoice",
      label: "El producto como testimonio en primera persona",
      ok: FIRST_PERSON.test(productLine) || /\b(tomo|uso|preparo|meto|llevo)\b/.test(productLine),
    },
    {
      id: "ctaLine",
      label: "La línea del CTA se dice en la escena cta y el caption la repite",
      ok:
        Boolean(script.cta) &&
        lastText.includes(normalizeText(script.cta)) &&
        normalizeText(script.caption).includes(normalizeText(keyword)),
    },
    {
      // Must be met, not just reported: a short script wastes paid seconds of
      // attention, a long one gets rushed. The detail doubles as the rewrite
      // instruction the model receives.
      id: "words",
      label: `${wordsMin}-${wordsMax} palabras de locución (${formatName} ${durationName})`,
      ok: totalWords >= wordsMin && totalWords <= wordsMax,
      detail:
        totalWords < wordsMin
          ? `${totalWords} palabras: faltan ${wordsMin - totalWords}; agrégalas con un segundo mecanismo, una objeción resuelta o una consecuencia práctica, nunca con relleno`
          : totalWords > wordsMax
            ? `${totalWords} palabras: sobran ${totalWords - wordsMax}; quita la palabra vacía`
            : `${totalWords} palabras`,
      hard: totalWords < wordsMin || totalWords > wordsMax,
    },
    {
      id: "naming",
      label: "Producto nombrado en español, sin «Pink Lemonade» ni «México»",
      ok: namingHits.length === 0,
      detail: namingHits.join("; ") || undefined,
      hard: namingHits.length > 0,
    },
    {
      id: "catalog",
      label: "Sin leer la ficha de catálogo (nombre + sabor + país + presentación)",
      ok: catalogHits.length === 0,
      detail: catalogHits.length ? `«${catalogHits[0]}»` : undefined,
      hard: catalogHits.length > 0,
    },
    {
      id: "pace",
      label: `Máximo ${SCENE_WORDS_MAX} palabras por escena`,
      ok: longScenes.length === 0,
      detail: longScenes.length
        ? longScenes.map((scene) => `escena ${scene.index + 1}: ${scene.count}`).join(", ")
        : undefined,
    },
    {
      id: "brochure",
      label: "Sin verbos de folleto (requiere, produce, actúa, apoya…)",
      ok: brochureHits.length === 0,
      detail: brochureHits.length
        ? brochureHits.map((hit) => `escena ${hit.index + 1}: «${hit.match}»`).join(", ")
        : undefined,
      hard: brochureHits.length > 0,
    },
    {
      id: "insight",
      label: "La moraleja dice algo que ella no sabía",
      ok: inBody(script.newInsight),
      detail: script.newInsight ? undefined : "falta el dato nuevo",
      hard: !inBody(script.newInsight),
    },
    ...(budget.insights === 2
      ? [
          {
            // Long ranges need a second real insight; without one the extra
            // time can only be filled with padding.
            id: "secondInsight",
            label: "Segundo dato nuevo (videos de 40 s o más)",
            ok:
              inBody(script.secondInsight) &&
              normalizeText(script.secondInsight) !== normalizeText(script.newInsight),
            detail: script.secondInsight
              ? undefined
              : "falta el segundo dato; si no hay uno real, la duración debe ser corta",
            hard: true,
          } satisfies QualityCheck,
        ]
      : []),
    {
      id: "felt",
      label: "Nombra lo que ella sintió",
      ok: inBody(script.feltLine),
      detail: script.feltLine ? undefined : "falta la emoción",
      hard: !inBody(script.feltLine),
    },
    {
      id: "productEffect",
      label: "El producto solo se nombra, sin atribuirle efectos",
      ok: effectHits.length === 0,
      detail: effectHits.length ? `escena ${effectHits.map((hit) => hit.index + 1).join(", ")}` : undefined,
      hard: effectHits.length > 0,
    },
    {
      id: "claims",
      label: "Sin claims médicos ni plazos de resultados",
      ok: !MEDICAL_CLAIM.test(fullText) && !promise,
      detail: [fullText.match(MEDICAL_CLAIM)?.[0], promise].filter(Boolean).join("; ") || undefined,
      hard: MEDICAL_CLAIM.test(fullText) || Boolean(promise),
    },
    {
      id: "forbidden",
      label: "Sin frases prohibidas por la marca",
      ok: forbidden.length === 0,
      detail: forbidden.map((item) => item.why).join("; ") || undefined,
      hard: forbidden.length > 0,
    },
  ];

  checks.push(...runFormatChecks(script));

  if (channel === "pagado") {
    const hits = scenes
      .map((scene, index) => ({ index, text: `${scene.voiceover} ${scene.onScreenText}` }))
      .filter((scene) => PAID_SECOND_PERSON.test(scene.text));
    checks.push({
      id: "paid",
      label: "Anuncio: sin segunda persona sobre la condición",
      ok: hits.length === 0,
      detail: hits.length ? `revisar escena ${hits.map((h) => h.index + 1).join(", ")}` : undefined,
    });
  }
  return checks;
}

/** Checks that the script is actually staged in its format. */
export function runFormatChecks(script: VideoScript): QualityCheck[] {
  const spec = VIDEO_FORMATS[script.format];
  const allLines = script.scenes.flatMap((scene) => scene.lines ?? []);
  const speakers = new Set(allLines.map((line) => normalizeText(line.speaker)).filter(Boolean));
  const speakerOf = (sentence: string) => {
    const target = normalizeText(sentence);
    return allLines.find((line) => target && normalizeText(line.text).includes(target))?.speaker;
  };
  const checks: QualityCheck[] = [
    {
      id: "formatReason",
      label: `Formato ${spec.label} justificado`,
      ok: Boolean(script.formatReason?.trim()),
      detail: script.formatReason?.trim() || "falta la razón",
    },
  ];

  if (spec.dialogue) {
    const firstLine = script.scenes[0]?.lines?.[0];
    const insightBy = speakerOf(script.newInsight);
    const feltBy = speakerOf(script.feltLine);
    checks.push(
      {
        id: "dialogue",
        label: "Diálogo con al menos dos personajes",
        ok: speakers.size >= 2,
        detail: `${speakers.size} personaje(s)`,
        hard: speakers.size < 2,
      },
      {
        id: "dialogueHook",
        label: "El gancho es la primera línea de diálogo",
        ok: Boolean(firstLine) && normalizeText(firstLine!.text).includes(normalizeText(script.hook).slice(0, 40)),
      },
      {
        id: "dialogueRoles",
        label: "El dato lo dice quien sabe y la emoción quien no sabe",
        ok: Boolean(insightBy && feltBy && normalizeText(insightBy) !== normalizeText(feltBy)),
        detail: insightBy && feltBy ? `dato: ${insightBy} · emoción: ${feltBy}` : undefined,
      }
    );
  } else {
    checks.push({
      id: "singleVoice",
      label: "Una sola voz",
      ok: speakers.size <= 1,
      detail: speakers.size > 1 ? [...speakers].join(", ") : undefined,
    });
  }

  if (script.format === "reaccion") {
    checks.push({
      id: "comment",
      label: "Comentario de su audiencia en pantalla como gancho",
      ok: Boolean(script.onScreenComment),
      hard: !script.onScreenComment,
    });
  }
  if (script.format === "dinamico") {
    const withText = script.scenes.filter((scene) => scene.onScreenText.trim()).length;
    checks.push({
      id: "onScreen",
      label: "Texto en pantalla en la mayoría de escenas",
      ok: withText >= 3,
      detail: `${withText} de ${script.scenes.length}`,
    });
  }
  return checks;
}

/** Writes (or rewrites, with the stored feedback) the script of a project. */
export async function generateVideoScript(projectId: string): Promise<VideoProject> {
  const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
  const product = project.product as VideoProduct;
  const channel = project.channel as VideoChannel;
  const requiredFormat = project.format && project.format !== "auto" ? (project.format as VideoFormat) : undefined;
  const requestedDuration = (project.duration as VideoDuration | null) ?? "auto";
  // "auto" lets the model drop to corto when it has no second real insight.
  const requiredTier: DurationTier | undefined =
    requestedDuration === "auto" ? undefined : requestedDuration;
  const awareness = (project.awareness as AwarenessParam | null) ?? "1";
  const requiredAwareness: AwarenessLevel | undefined = awareness === "auto" ? undefined : awareness;
  const previousFormat = project.ideaValidated ? ((project.previousFormat as VideoFormat | null) ?? null) : null;
  const hookVoice = (project.hookVoice as HookVoiceParam | null) ?? "auto";
  const requiredHookVoice: HookVoice | undefined = hookVoice === "auto" ? undefined : hookVoice;
  const previous = project.script as VideoScript | null;

  try {
    // Step 0, behind the scenes: video viral = winning idea. The reviewer
    // sends a few words, so the checklist develops them into an angle that
    // meets the filters and the script is written from it. It runs once per
    // project and never blocks writing.
    let ideaCheck = project.ideaCheck as (Partial<IdeaCheck> & { reformulations?: string[] }) | null;
    if (!ideaCheck) {
      const { check } = await checkIdea(project.idea, product);
      ideaCheck = check;
      await prisma.videoProject.update({
        where: { id: project.id },
        data: { ideaCheck: check as unknown as object },
      });
    }
    // Projects checked before the checklist developed angles kept rewrites instead.
    const angle = ideaCheck.angle || ideaCheck.reformulations?.[0] || "";

    const instructions = buildScriptInstructions(getBrandContext());
    const brief = {
      idea: project.idea,
      product,
      channel,
      format: (project.format as VideoFormat | "auto" | null) ?? "auto",
      duration: requestedDuration,
      awareness,
      ideaValidated: project.ideaValidated,
      previousFormat,
      hookMold: project.hookMold,
      ctaKeyword: project.ctaKeyword,
      angle,
      hookVoice,
    };
    let feedback = project.feedback && previous ? project.feedback : undefined;
    let result: { script: VideoScript; checks: QualityCheck[]; model: string } | null = null;

    // Hard checks are requirements: up to two automatic rewrites with the
    // failures as instructions. A script that still fails is not delivered for
    // approval; it is kept as FAILED so the reviewer sees why and can retry.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const generated: { value: VideoScript; model: string } = await generateStructured<VideoScript>({
        name: "video_script",
        schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
        instructions,
        input: buildScriptInput(
          brief,
          feedback && (previous || result) ? { previous: result?.script ?? previous!, feedback } : undefined
        ),
      });
      const script = normalizeScript(
        generated.value,
        requiredFormat,
        requiredTier,
        requiredAwareness,
        project.ctaKeyword,
        requiredHookVoice
      );
      const checks = runScriptChecks(script, product, channel, {
        previousFormat,
        requiredCtaKeyword: project.ctaKeyword,
        requiredHookVoice,
      });
      result = { script, checks, model: generated.model };
      const failedHard = checks.filter((check) => check.hard && !check.ok);
      if (failedHard.length === 0) break;
      feedback = failedHard
        .map((check) => `${check.label}${check.detail ? ` (${check.detail})` : ""}`)
        .join("; ");
    }

    const stillFailing = result!.checks.filter((check) => check.hard && !check.ok);
    return await prisma.videoProject.update({
      where: { id: project.id },
      data: {
        status: stillFailing.length ? "FAILED" : "SCRIPT_READY",
        error: stillFailing.length
          ? `El guion no cumplió después de ${MAX_ATTEMPTS} intentos: ${stillFailing
              .map((check) => `${check.label}${check.detail ? ` (${check.detail})` : ""}`)
              .join("; ")}`
          : null,
        script: result!.script as unknown as object,
        checks: result!.checks as unknown as object,
        model: result!.model,
        feedback: null,
        revision: { increment: 1 },
      },
    });
  } catch (error) {
    return prisma.videoProject.update({
      where: { id: project.id },
      data: {
        // A failed revision keeps the previous script reviewable.
        status: previous ? "SCRIPT_READY" : "FAILED",
        error: errorMessage(error).slice(0, 2000),
      },
    });
  }
}
