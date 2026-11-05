import { describe, it, expect } from "vitest";
import { VIDEO_DURATIONS, getBrandContext } from "../lib/video/config";
import { scoreIdeaCheck } from "../lib/video/idea-check";
import { buildScriptInput, buildScriptInstructions, type VideoScript } from "../lib/video/prompt";
import {
  normalizeCtaKeyword,
  normalizeScript,
  runFormatChecks,
  runScriptChecks,
  toSpoken,
  toWritten,
} from "../lib/video/script";

type Section = VideoScript["scenes"][number]["section"];

function scene(section: Section, text: string | string[], productVisible = false, speaker = "Ella") {
  const texts = Array.isArray(text) ? text : [text];
  return {
    section,
    startSecond: 99,
    endSecond: 99,
    lines: texts.map((line) => ({ speaker, text: line, direction: "" })),
    voiceover: "",
    onScreenText: "",
    visual: "",
    productVisible,
    startFramePrompt: "",
    endFramePrompt: "",
    motionPrompt: "",
  };
}

const INSIGHT = "Ese patrón es la pista: no empieza en tu piel, empieza en tus hormonas.";
const FELT = "Y tú cambiando de crema cada mes, pensando que eras tú la que lo hacía mal.";
const BRIDGE = "Eso se trabaja por dentro.";
const PRODUCT = "Yo lo tomo cada mañana y mi piel por fin está tranquila.";
const CTA = "Si te pasa, escríbeme SOP y te digo por qué.";

/** A 30-second (corto) HAC script in the five parts. */
function script(overrides: Partial<VideoScript> = {}): VideoScript {
  return {
    title: "Acné en la mandíbula",
    format: "hac",
    formatReason: "Explica un mecanismo, mejor a cámara.",
    onScreenComment: "",
    durationTier: "corto",
    targetSeconds: 30,
    awarenessLevel: "1",
    hookMold: "propio",
    hookVoice: "primera",
    hook: "Cambié de crema tres veces y el acné de la mandíbula volvió. Siempre ahí.",
    symptom: "acné en la mandíbula que no se va con skincare",
    newInsight: INSIGHT,
    secondInsight: "",
    feltLine: FELT,
    ctaKeyword: "SOP",
    bridgeLine: BRIDGE,
    productLine: PRODUCT,
    bridgeTest: "Sin el producto sigue diciendo dónde está el problema.",
    character: "",
    visualStyle: "",
    scenes: [
      scene("gancho", "Cambié de crema tres veces y el acné de la mandíbula volvió. Siempre ahí."),
      scene("contexto", "No era la crema."),
      scene("moraleja", INSIGHT),
      scene("moraleja", FELT),
      scene("solucion", [BRIDGE, PRODUCT], true),
      scene("cta", CTA),
    ],
    cta: CTA,
    caption: CTA,
    hashtags: ["sop", "#acne hormonal"],
    storyFollowUps: [],
    ...overrides,
  };
}

const run = (value: VideoScript, product: "creatina" | "inositol" = "inositol", channel: "organico" | "pagado" = "organico") =>
  runScriptChecks(normalizeScript(value), product, channel);
const check = (checks: ReturnType<typeof runScriptChecks>, id: string) => checks.find((c) => c.id === id);

/** The brief's 55-second HAC example (acné de la mandíbula), split into 11 clips. */
function acneExample(): VideoScript {
  return {
    ...script(),
    durationTier: "estandar",
    hookVoice: "segunda",
    hook: "Dos años cambiando de skincare por un acné que no está en tu piel. Nadie te dijo dónde.",
    newInsight: "Mandíbula y barbilla. Siempre ahí, y casi siempre la misma semana del mes.",
    secondInsight: "Eso no es un patrón de limpieza, es un patrón hormonal",
    feltLine: "Y mientras tanto te sentiste sucia o descuidada por algo que nunca fue tu culpa.",
    bridgeLine: "Si viene de adentro, ahí es donde hay que trabajar. No en la cara.",
    productLine: "Yo ahora tomo el inositol de Peach Perfect cada mañana, y mi mandíbula por fin está tranquila.",
    ctaKeyword: "MANDÍBULA",
    cta: "Si te pasa, escríbeme MANDÍBULA y te digo dónde buscar.",
    caption: "Si te pasa, escríbeme MANDÍBULA y te digo dónde buscar.",
    scenes: [
      scene("gancho", "Dos años cambiando de skincare por un acné que no está en tu piel. Nadie te dijo dónde."),
      scene("contexto", "Y ya probaste todo. Ácido salicílico, niacinamida, la rutina coreana de diez pasos,"),
      scene("contexto", "Te mejora un poco"),
      scene("contexto", "y a las dos semanas vuelve. Siempre vuelve. Pero fíjate dónde."),
      scene("moraleja", "Mandíbula y barbilla. Siempre ahí, y casi siempre la misma semana del mes. Eso no es"),
      scene("moraleja", "un patrón de limpieza, es un patrón hormonal, y por eso ningún producto que se queda"),
      scene("moraleja", "en la superficie lo va a tocar. Lo estabas atacando en el lugar equivocado."),
      scene("moraleja", "Y mientras tanto te sentiste sucia o descuidada por algo que nunca fue tu culpa."),
      scene("solucion", "Si viene de adentro, ahí es donde hay que trabajar. No en la cara."),
      scene("solucion", "Yo ahora tomo el inositol de Peach Perfect cada mañana, y mi mandíbula por fin está tranquila.", true),
      scene("cta", "Si te pasa, escríbeme MANDÍBULA y te digo dónde buscar."),
    ],
  };
}

describe("normalizeScript", () => {
  it("forces 5-second consecutive timings and clean hashtags", () => {
    const normalized = normalizeScript(script());
    expect(normalized.scenes.map((s) => [s.startSecond, s.endSecond])).toEqual([
      [0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30],
    ]);
    expect(normalized.targetSeconds).toBe(30);
    expect(normalized.hashtags).toEqual(["#sop", "#acnehormonal"]);
  });

  it("joins dialogue lines into the scene voiceover", () => {
    const normalized = normalizeScript(script());
    expect(normalized.scenes[4].voiceover).toBe(`${BRIDGE} ${PRODUCT}`);
  });
});

describe("base rules", () => {
  it("passes a short script that follows the method", () => {
    expect(run(script()).filter((c) => !c.ok)).toEqual([]);
  });

  it("flags the brand in the hook and the product before the solution", () => {
    const bad = script();
    bad.scenes[0] = scene("gancho", "Peach Perfect tiene el mejor inositol", true);
    const checks = run(bad);
    expect(check(checks, "hook")?.ok).toBe(false);
    expect(check(checks, "product")?.ok).toBe(false);
  });

  it("flags a missing CTA keyword and forbidden phrases", () => {
    const bad = script({ cta: "Sígueme para más" });
    bad.scenes[5] = scene("cta", "Sígueme para más tips.");
    const checks = run(bad);
    expect(check(checks, "cta")?.ok).toBe(false);
    expect(check(checks, "forbidden")?.ok).toBe(false);
  });

  it("flags brochure verbs", () => {
    const bad = script();
    bad.scenes[1] = scene("contexto", "El skincare actúa en la superficie y tu cuerpo requiere más.");
    expect(check(run(bad), "brochure")?.detail).toContain("actua");
  });

  it("flags effects attributed to the product", () => {
    const bad = script();
    bad.scenes[4] = scene("solucion", [BRIDGE, "El inositol de Peach Perfect te ayuda a equilibrar tus hormonas."], true);
    expect(check(run(bad), "productEffect")?.ok).toBe(false);
  });

  it("flags medical claims and time-bound promises but allows time data", () => {
    expect(check(run(script({ caption: "El inositol regulariza tu ciclo." })), "claims")?.ok).toBe(false);
    expect(check(run(script({ caption: "En 8 semanas vas a ver la diferencia." })), "claims")?.ok).toBe(false);
    expect(check(run(script({ caption: "Aparece la semana antes de que te baje. Se trata de un patrón." })), "claims")?.ok).toBe(true);
  });

  it("flags second person about the condition in paid ads only", () => {
    const paid = script();
    paid.scenes[1] = scene("contexto", "Si tienes SOP, tu ciclo no es normal.");
    expect(check(run(paid, "inositol", "pagado"), "paid")?.ok).toBe(false);
    expect(check(run(paid), "paid")).toBeUndefined();
  });
});

describe("five-part structure", () => {
  it("requires every part in order", () => {
    const missing = script();
    missing.scenes[1] = scene("moraleja", "Y no era la crema.");
    expect(check(run(missing), "structure")?.ok).toBe(false);

    const shuffled = script();
    shuffled.scenes = [shuffled.scenes[0], shuffled.scenes[2], shuffled.scenes[1], ...shuffled.scenes.slice(3)];
    expect(check(run(shuffled), "structure")?.hard).toBe(true);
  });

  it("keeps the reveal out of the context", () => {
    const early = script();
    early.scenes[1] = scene("contexto", INSIGHT);
    early.scenes[2] = scene("moraleja", "Y no era la crema.");
    const checks = run(early);
    expect(check(checks, "intrigue")?.ok).toBe(false);
    expect(check(checks, "insight")?.ok).toBe(false);
  });

  it("requires the insight and the felt line inside the lesson", () => {
    const checks = run(script({ newInsight: "", feltLine: "Una frase que no está en el guion." }));
    expect(check(checks, "insight")?.ok).toBe(false);
    expect(check(checks, "felt")?.ok).toBe(false);
  });
});

describe("solution bridge (4a) and product (4b)", () => {
  it("rejects a solution without a bridge", () => {
    const bad = script({ bridgeLine: "" });
    bad.scenes[4] = scene("solucion", PRODUCT, true);
    const checks = run(bad);
    expect(check(checks, "bridge")?.ok).toBe(false);
    expect(check(checks, "bridgeStandsAlone")?.hard).toBe(true);
  });

  it("rejects a bridge with a body effect or a promise", () => {
    const line = "Por eso tomo myo-inositol, que regula tus hormonas.";
    const bad = script({ bridgeLine: line });
    bad.scenes[4] = scene("solucion", [line, PRODUCT], true);
    expect(check(run(bad), "bridgeClaim")?.ok).toBe(false);
  });

  it("rejects a bridge that only works as a sales line", () => {
    const line = "Por eso mi bote de Peach Perfect es lo que tomo.";
    const bad = script({ bridgeLine: line });
    bad.scenes[4] = scene("solucion", [line, PRODUCT], true);
    expect(check(run(bad), "bridgeStandsAlone")?.ok).toBe(false);
  });

  it("requires the product line after the bridge", () => {
    const bad = script();
    bad.scenes[4] = scene("solucion", [PRODUCT, BRIDGE], true);
    expect(check(run(bad), "bridge")?.ok).toBe(false);
  });

  it("accepts the creatina bridges from the brief", () => {
    for (const bridge of [
      "Y si vas a darle las semanas que pide, por lo menos que sea monohidratada y que la dosis esté completa.",
      "O sea que el miedo nunca fue a la creatina, fue a algo que ni siquiera pasa así.",
    ]) {
      const value = script({ bridgeLine: bridge });
      const checks = run(value);
      expect(check(checks, "bridgeClaim")?.ok).toBe(true);
      expect(check(checks, "bridgeStandsAlone")?.ok).toBe(true);
    }
  });
});

describe("independent piece, awareness and validated ideas", () => {
  it("rejects references to other videos", () => {
    const bad = script();
    bad.scenes[1] = scene("contexto", "Como les conté en el video anterior, vuelve.");
    expect(check(run(bad), "independent")?.ok).toBe(false);
  });

  it("warns when the script talks to awareness levels 3-4", () => {
    expect(check(run(script({ caption: "Peach Perfect vs otras marcas" })), "awareness")?.ok).toBe(false);
  });

  it("requires a new format for a validated idea", () => {
    const same = runScriptChecks(normalizeScript(script()), "inositol", "organico", { previousFormat: "hac" });
    expect(check(same, "newFormat")?.hard).toBe(true);
    const other = runScriptChecks(normalizeScript(script()), "inositol", "organico", { previousFormat: "pov" });
    expect(check(other, "newFormat")?.ok).toBe(true);
  });

  it("forces the requested awareness level", () => {
    expect(normalizeScript(script({ awarenessLevel: "2" }), "hac", "corto", "0").awarenessLevel).toBe("0");
  });
});

describe("idea checklist", () => {
  const filters = (passed: number) =>
    Object.fromEntries(
      ["contracorriente", "filtro550", "unicidad", "aplicable", "polemico", "formato", "personaje", "referencia"].map(
        (id, index) => [id, { passed: index < passed, reason: "" }]
      )
    ) as Parameters<typeof scoreIdeaCheck>[0]["filters"];

  it("scores the raw idea and the developed angle separately", () => {
    const check = scoreIdeaCheck({
      filters: filters(2),
      angle: "  Tu acné de la mandíbula no está en tu piel.  ",
      angleFilters: filters(6),
      viralReference: "",
    });
    expect(check.score).toBe(2);
    expect(check.angleScore).toBe(6);
    expect(check.angle).toBe("Tu acné de la mandíbula no está en tu piel.");
    expect(check.passed).toBe(true);
  });

  it("never blocks: a weak angle only reports passed=false", () => {
    const check = scoreIdeaCheck({ filters: filters(1), angle: "x", angleFilters: filters(4), viralReference: "" });
    expect(check.passed).toBe(false);
  });

  it("writes the script from the developed angle", () => {
    const input = buildScriptInput({
      idea: "glúteos no crecen",
      product: "creatina",
      channel: "organico",
      angle: "Haces más sentadillas y no crecen porque nadie te habló de la progresión.",
    });
    expect(input).toContain("Idea de la revisora: glúteos no crecen");
    expect(input).toContain("Ángulo desarrollado con la checklist");
    expect(input).toContain("nadie te habló de la progresión");
  });
});

describe("voiceover and on-screen layers", () => {
  it("spells English words phonetically only in the voiceover", () => {
    expect(toSpoken("La creatina de Peach Perfect, un scoop antes del pre workout.")).toBe(
      "La creatina de pich pérfect, un scup antes del pri wórcaut."
    );
    expect(toWritten("Pich Pérfect · un scup · fítnes")).toBe("Peach Perfect · un scoop · fitness");
  });

  it("normalizes each layer to its spelling", () => {
    const raw = script({ caption: "Prueba pich pérfect", title: "pich perfect test" });
    raw.scenes[4] = { ...scene("solucion", [BRIDGE, "Por eso tomo la creatina de Peach Perfect, un scoop."], true), onScreenText: "1 scup de pich pérfect" };
    const normalized = normalizeScript(raw);
    expect(normalized.scenes[4].voiceover).toContain("la creatina de pich pérfect, un scup.");
    expect(normalized.scenes[4].onScreenText).toBe("1 scoop de Peach Perfect");
    expect(normalized.caption).toBe("Prueba Peach Perfect");
    expect(normalized.title).toBe("Peach Perfect test");
  });

  it("rejects Pink Lemonade, México and catalog-sheet naming in the voiceover", () => {
    const line = "Esta es Creatina Pink Lemonade de Peach Perfect México, en polvo.";
    const bad = script({ productLine: line });
    bad.scenes[4] = scene("solucion", [BRIDGE, line], true);
    const checks = run(bad, "creatina");
    expect(check(checks, "naming")?.hard).toBe(true);
    expect(check(checks, "catalog")?.ok).toBe(false);
  });
});

describe("video formats", () => {
  it("keeps the chosen format and strips brackets from directions", () => {
    const raw = script({ format: "vof" });
    raw.scenes[1] = { ...scene("contexto", "Primera parte."), lines: [{ speaker: "Ella", text: "Primera parte.", direction: "[mira a cámara]" }] };
    const normalized = normalizeScript(raw, "personaje");
    expect(normalized.format).toBe("personaje");
    expect(normalized.scenes[1].lines[0].direction).toBe("mira a cámara");
  });

  it("requires two speakers in dialogue formats, with roles split", () => {
    expect(check(runFormatChecks(normalizeScript(script(), "personaje")), "dialogue")?.ok).toBe(false);
    const duo = script({ format: "personaje", hook: "Me compré otra crema." });
    duo.scenes[0] = scene("gancho", "Me compré otra crema. Ya van tres este mes.", false, "Amiga");
    duo.scenes[2] = scene("moraleja", INSIGHT, false, "La que sabe");
    duo.scenes[3] = scene("moraleja", FELT, false, "Amiga");
    const checks = runFormatChecks(normalizeScript(duo));
    expect(check(checks, "dialogue")?.ok).toBe(true);
    expect(check(checks, "dialogueHook")?.ok).toBe(true);
    expect(check(checks, "dialogueRoles")?.ok).toBe(true);
  });

  it("needs the on-screen comment in reactions", () => {
    expect(check(runFormatChecks(normalizeScript(script({ format: "reaccion" }))), "comment")?.ok).toBe(false);
    const withComment = script({ format: "reaccion", onScreenComment: "¿Y si ya probé todo el skincare?" });
    expect(check(runFormatChecks(normalizeScript(withComment)), "comment")?.ok).toBe(true);
  });
});

describe("duration ranges", () => {
  it("passes the 55-second acne example from the brief on every check", () => {
    const normalized = normalizeScript(acneExample(), "hac", "estandar", "1");
    expect(normalized.targetSeconds).toBe(55);
    expect(normalized.scenes[9].voiceover).toContain("el inositol de pich pérfect cada mañana");
    const failing = runScriptChecks(normalized, "inositol", "organico").filter((c) => !c.ok);
    expect(failing).toEqual([]);
  });

  it("requires a second insight in the long ranges", () => {
    const missing = normalizeScript({ ...acneExample(), secondInsight: "" }, "hac", "estandar");
    expect(check(runScriptChecks(missing, "inositol", "organico"), "secondInsight")?.ok).toBe(false);
    expect(check(run(script()), "secondInsight")).toBeUndefined();
  });

  it("checks seconds and words against the format and tier", () => {
    const long = runScriptChecks(normalizeScript(script(), "hac", "estandar"), "inositol", "organico");
    expect(check(long, "duration")?.ok).toBe(false);
    expect(check(long, "words")?.ok).toBe(false);
    const short = runScriptChecks(normalizeScript(script(), "hac", "corto"), "inositol", "organico");
    expect(check(short, "duration")?.ok).toBe(true);
    expect(check(short, "words")?.ok).toBe(true);
  });

  it("uses shorter ranges for dialogue", () => {
    expect(VIDEO_DURATIONS.pov.estandar.seconds).toEqual([30, 40]);
    expect(VIDEO_DURATIONS.personaje.corto.words).toEqual([50, 60]);
  });
});

describe("script prompt", () => {
  const instructions = buildScriptInstructions(getBrandContext());

  it("embeds the brand document, the five parts, the bridge and the new few-shot", () => {
    expect(instructions).toContain("Peach Perfect MX — Contexto de marca");
    expect(instructions).toContain("EL GUION TIENE 5 PARTES");
    expect(instructions).toContain("LA FRASE PUENTE (parte 4a)");
    expect(instructions).toContain("Si el problema es [X], ahí es donde hay que trabajar.");
    expect(instructions).toContain("CADA PIEZA ES INDEPENDIENTE");
    expect(instructions).toContain("NIVEL DE CONCIENCIA");
    expect(instructions).toContain("Dos años cambiando de skincare por un acné que no está en tu piel. Nadie te dijo dónde.");
    expect(instructions).toContain("EL GANCHO: SEGUNDA PERSONA POR DEFECTO, NUNCA PREGUNTA");
    expect(instructions).not.toContain("Si dejaste la creatina a las tres semanas porque no viste nada");
  });

  it("passes awareness, duration and validated-idea parameters", () => {
    const input = buildScriptInput({
      idea: "x",
      product: "creatina",
      channel: "organico",
      format: "pov",
      duration: "estandar",
      awareness: "0",
      ideaValidated: true,
      previousFormat: "hac",
    });
    expect(input).toContain("Nivel de conciencia: 0");
    expect(input).toContain("30-40 s y 70-95 palabras");
    expect(input).toContain("IDEA VALIDADA");
    expect(input).toContain("usa un formato distinto a hac");
    expect(buildScriptInput({ idea: "x", product: "inositol", channel: "pagado" })).toContain(
      "CTA: crea el de este video"
    );
    expect(
      buildScriptInput({ idea: "x", product: "inositol", channel: "organico", ctaKeyword: "mandíbula" })
    ).toContain("palabra clave MANDÍBULA");
  });
});

describe("dynamic CTA", () => {
  const withCta = (keyword: string, line: string, overrides: Partial<VideoScript> = {}) => {
    const value = script({ ctaKeyword: keyword, cta: line, caption: line, ...overrides });
    value.scenes[5] = scene("cta", line);
    return value;
  };

  it("accepts a keyword tied to the video", () => {
    const checks = run(withCta("MANDÍBULA", "Si te pasa, escríbeme MANDÍBULA y te digo por qué."));
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("requires the keyword to be said in the CTA scene", () => {
    const value = withCta("ANTOJO", "Si te pasa, escríbeme ANTOJO y te digo por qué.");
    value.scenes[5] = scene("cta", "Si te pasa, escríbeme y te digo por qué.");
    expect(check(run(value), "cta")?.hard).toBe(true);
  });

  it("rejects keywords that are not one short word", () => {
    expect(check(run(withCta("MI SOP", "Si te pasa, escríbeme MI SOP y te digo por qué.")), "ctaKeyword")?.ok).toBe(false);
    expect(check(run(withCta("SOP2", "Si te pasa, escríbeme SOP2 y te digo por qué.")), "ctaKeyword")?.ok).toBe(false);
  });

  it("rejects offers the DM cannot deliver", () => {
    const checks = run(withCta("SOP", "Si te pasa, comenta SOP y te mando un cupón de descuento."));
    expect(check(checks, "ctaOffer")?.hard).toBe(true);
  });

  it("enforces a keyword pinned by the reviewer", () => {
    const normalized = normalizeScript(withCta("ACNE", "Si te pasa, escríbeme ACNE y te digo por qué."), "hac", "corto", "1", "mandíbula");
    expect(normalized.ctaKeyword).toBe("MANDÍBULA");
    const checks = runScriptChecks(
      normalizeScript(withCta("ACNE", "Si te pasa, escríbeme ACNE y te digo por qué.")),
      "inositol",
      "organico",
      { requiredCtaKeyword: "mandíbula" }
    );
    expect(check(checks, "ctaKeywordRequested")?.hard).toBe(true);
  });

  it("normalizes keywords to one uppercase word", () => {
    expect(normalizeCtaKeyword(" #glúteos ")).toBe("GLÚTEOS");
  });
});

describe("story hook", () => {
  it("rejects rhetorical-question hooks", () => {
    for (const hook of ["¿Te pasa que tus glúteos no crecen?", "Te ha pasado que entrenas y nada cambia."]) {
      const bad = script({ hook });
      bad.scenes[0] = scene("gancho", hook);
      expect(check(run(bad), "hookStory")?.hard).toBe(true);
    }
  });

  it("accepts second-person problem hooks and first-person resolved stories", () => {
    for (const [hookVoice, hook] of [
      ["segunda", "Haces más y más sentadillas y tus glúteos siguen igual. El problema podría ser otro."],
      ["segunda", "Llevas meses haciendo sentadillas y tus glúteos siguen exactamente igual. No es tu culpa."],
      ["primera", "Tomé creatina un mes, no vi nada y la tiré a la basura. Ahora sé por qué no funcionó."],
      ["primera", "Tres meses tomando inositol sin ver nada. Luego descubrí que lo tomaba en el momento equivocado."],
    ] as const) {
      const value = script({ hook, hookVoice });
      const checks = run(value);
      expect(check(checks, "hookStory")?.ok).toBe(true);
      expect(check(checks, "hookVoice")?.ok).toBe(true);
      expect(check(checks, "hookCuriosity")?.ok).toBe(true);
    }
  });

  it("lets the reaction comment be a question", () => {
    const reaction = script({ format: "reaccion", hook: "¿Y si ya probé todo el skincare?", onScreenComment: "¿Y si ya probé todo el skincare?" });
    expect(check(run(reaction), "hookStory")).toBeUndefined();
  });
});

describe("CTA micro-solution and product as experience", () => {
  it("rejects a CTA that offers the link or info", () => {
    for (const line of ["Comenta SOP y te mando el link.", "Si te pasa, comenta SOP y te mando info."]) {
      const value = script({ cta: line, caption: line });
      value.scenes[5] = scene("cta", line);
      expect(check(run(value), "ctaOffer")?.ok).toBe(false);
    }
  });

  it("requires the «Si…» opening", () => {
    const line = "Escríbeme SOP y te digo por qué vuelve.";
    const value = script({ cta: line, caption: line });
    value.scenes[5] = scene("cta", line);
    expect(check(run(value), "ctaOpening")?.hard).toBe(true);
  });

  it("accepts the brief's CTA examples", () => {
    for (const [keyword, line] of [
      ["GLÚTEOS", "Si quieres empezar, escríbeme GLÚTEOS aquí abajo y te digo cómo."],
      ["DULCE", "Si sientes eso, escríbeme DULCE y te explico por qué."],
    ]) {
      const value = script({ ctaKeyword: keyword, cta: line, caption: line });
      value.scenes[5] = scene("cta", line);
      const checks = run(value);
      expect(check(checks, "ctaOffer")?.ok).toBe(true);
      expect(check(checks, "ctaOpening")?.ok).toBe(true);
    }
  });

  it("rejects spec-sheet product lines", () => {
    const spec = "La creatina de Peach Perfect es monohidratada, cinco gramos por scoop.";
    const specScript = script({ productLine: spec });
    specScript.scenes[4] = scene("solucion", [BRIDGE, spec], true);
    expect(check(run(specScript), "productSpecs")?.hard).toBe(true);
  });

  it("accepts a first-person testimonial with her result and time frame", () => {
    for (const line of [
      "Yo llevo seis semanas tomando esta creatina y mis glúteos por fin están respondiendo.",
      "Llevo tres semanas tomándola, limonada rosa, y se me quitó el acné.",
    ]) {
      const value = script({ productLine: line });
      value.scenes[4] = scene("solucion", [BRIDGE, line], true);
      const checks = run(value, "creatina");
      expect(check(checks, "productEffect")?.ok).toBe(true);
      expect(check(checks, "productSpecs")?.ok).toBe(true);
      expect(check(checks, "productVoice")?.ok).toBe(true);
    }
  });

  it("still rejects effects promised to her and medical claims", () => {
    const promised = "Esta creatina te ayuda a que crezcan tus glúteos.";
    const promisedScript = script({ productLine: promised });
    promisedScript.scenes[4] = scene("solucion", [BRIDGE, promised], true);
    expect(check(run(promisedScript, "creatina"), "productEffect")?.ok).toBe(false);

    const claim = "Yo lo tomo diario y me regularizó el ciclo.";
    const claimScript = script({ productLine: claim });
    claimScript.scenes[4] = scene("solucion", [BRIDGE, claim], true);
    expect(check(run(claimScript), "claims")?.ok).toBe(false);
  });

  it("accepts a lived-experience product line", () => {
    const line = "Yo la tomo diario, sabor limonada rosa, y ya no la dejo.";
    const value = script({ productLine: line });
    value.scenes[4] = scene("solucion", [BRIDGE, line], true);
    const checks = run(value, "creatina");
    expect(check(checks, "productSpecs")?.ok).toBe(true);
    expect(check(checks, "productEffect")?.ok).toBe(true);
    expect(check(checks, "productVoice")?.ok).toBe(true);
  });
});

describe("hook voice", () => {
  it("defaults to second person when the model omits the voice", () => {
    const value = { ...script() } as Partial<VideoScript>;
    delete value.hookVoice;
    expect(normalizeScript(value as VideoScript).hookVoice).toBe("segunda");
  });

  it("warns when the hook does not match its declared voice", () => {
    const value = script({ hookVoice: "segunda", hook: "Tomé creatina un mes y la dejé. Ahora sé por qué." });
    expect(check(run(value), "hookVoice")?.ok).toBe(false);
  });
});

describe("review of a generated sentadillas script", () => {
  // The script the generator produced, and the brief's two corrections.
  const sentadillas = (hook: string, productLine: string): VideoScript => {
    const value = script({
      ctaKeyword: "SENTADILLAS",
      hookVoice: "primera",
      hook,
      productLine,
      bridgeLine: "Si el problema es cómo entreno y descanso, ahí es donde tengo que trabajar.",
      cta: "Si tus glúteos siguen igual, escríbeme SENTADILLAS y te digo cómo empezar.",
      caption: "Si tus glúteos siguen igual, escríbeme SENTADILLAS y te digo cómo empezar.",
    });
    value.scenes[0] = scene("gancho", hook);
    value.scenes[4] = scene("solucion", [value.bridgeLine, productLine], true);
    value.scenes[5] = scene("cta", value.cta);
    return value;
  };

  it("flags the vague hook and the product line without a physical result", () => {
    const original = sentadillas(
      "Hice más y más sentadillas y mis glúteos seguían igual. El problema era otro.",
      "Yo sumé la creatina de pich pérfect a mi rutina y dejé de pensar que necesitaba hacer sentadillas sin parar."
    );
    const checks = run(original, "creatina");
    expect(check(checks, "hookSpecific")?.hard).toBe(true);
    expect(check(checks, "productResult")?.hard).toBe(true);
  });

  it("passes both checks with the corrections", () => {
    const corrected = sentadillas(
      "Hice más y más sentadillas y mis glúteos seguían igual. Nadie me dijo que sin esto el músculo no puede crecer.",
      "Yo sumé la creatina de Peach Perfect a mi rutina y en unas semanas mis glúteos por fin empezaron a responder."
    );
    const checks = run(corrected, "creatina");
    expect(check(checks, "hookSpecific")?.ok).toBe(true);
    expect(check(checks, "productResult")?.ok).toBe(true);
    expect(check(checks, "claims")?.ok).toBe(true);
    expect(check(checks, "productEffect")?.ok).toBe(true);
  });
});

describe("hook voice parameter", () => {
  it("forces the voice the reviewer picked", () => {
    expect(normalizeScript(script({ hookVoice: "primera" }), "hac", "corto", "1", null, "segunda").hookVoice).toBe("segunda");
  });

  it("makes a mismatch a requirement only when the voice was picked", () => {
    const firstPersonHook = script({ hookVoice: "segunda", hook: "Tomé creatina un mes y la dejé. Ahora sé por qué." });
    firstPersonHook.scenes[0] = scene("gancho", firstPersonHook.hook);
    const picked = runScriptChecks(normalizeScript(firstPersonHook), "inositol", "organico", { requiredHookVoice: "segunda" });
    expect(check(picked, "hookVoice")?.hard).toBe(true);
    const auto = runScriptChecks(normalizeScript(firstPersonHook), "inositol", "organico");
    expect(check(auto, "hookVoice")?.ok).toBe(false);
    expect(check(auto, "hookVoice")?.hard).toBe(false);
  });

  it("tells the model the chosen voice, with the paid-ad caveat", () => {
    const paid = buildScriptInput({ idea: "x", product: "inositol", channel: "pagado", hookVoice: "segunda" });
    expect(paid).toContain("Voz del gancho: segunda persona (elegida por la revisora)");
    expect(paid).toContain("no nombres la condición de salud");
    expect(buildScriptInput({ idea: "x", product: "inositol", channel: "organico" })).toContain("Voz del gancho: auto");
  });
});

