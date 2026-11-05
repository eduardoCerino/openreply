import { describe, it, expect } from "vitest";
import { VIDEO_DURATIONS, getBrandContext } from "../lib/video/config";
import { scoreIdeaCheck } from "../lib/video/idea-check";
import { buildScriptInput, buildScriptInstructions, type VideoScript } from "../lib/video/prompt";
import { normalizeScript, runFormatChecks, runScriptChecks, toSpoken, toWritten } from "../lib/video/script";

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
const BRIDGE = "Si viene de adentro, ahí es donde hay que trabajar.";
const PRODUCT = "Mi bote: myo-inositol, limonada rosa.";

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
    hook: "¿Por qué siempre en la mandíbula, la semana antes de que te baje?",
    symptom: "acné en la mandíbula que no se va con skincare",
    newInsight: INSIGHT,
    secondInsight: "",
    feltLine: FELT,
    bridgeLine: BRIDGE,
    productLine: PRODUCT,
    bridgeTest: "Sin el producto sigue diciendo dónde está el problema.",
    character: "",
    visualStyle: "",
    scenes: [
      scene("gancho", "¿Por qué siempre en la mandíbula, la semana antes de que te baje?"),
      scene("contexto", "Ya cambiaste tres veces de crema y vuelve."),
      scene("moraleja", INSIGHT),
      scene("moraleja", FELT),
      scene("solucion", [BRIDGE, PRODUCT], true),
      scene("cta", "Escríbeme SOP y te paso la fórmula completa."),
    ],
    cta: "Escríbeme SOP y te paso la fórmula completa",
    caption: "",
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
    hook: "Llevas dos años cambiando de skincare por un acné que no está en tu piel.",
    newInsight: "Mandíbula y barbilla. Siempre ahí, y casi siempre la misma semana del mes.",
    secondInsight: "Eso no es un patrón de limpieza, es un patrón hormonal",
    feltLine: "Y mientras tanto te sentiste sucia o descuidada por algo que nunca fue tu culpa.",
    bridgeLine: "Si viene de adentro, ahí es donde hay que trabajar. No en la cara.",
    productLine: "Por eso mi bote lleva myo-inositol con zinc, sabor limonada rosa, de Peach Perfect.",
    scenes: [
      scene("gancho", "Llevas dos años cambiando de skincare por un acné que no está en tu piel."),
      scene("contexto", "Y ya probaste todo. Ácido salicílico, niacinamida, la rutina coreana de diez pasos,"),
      scene("contexto", "cambiar la funda de la almohada cada tercer día. Te mejora un poco"),
      scene("contexto", "y a las dos semanas vuelve. Siempre vuelve. Pero fíjate dónde."),
      scene("moraleja", "Mandíbula y barbilla. Siempre ahí, y casi siempre la misma semana del mes. Eso no es"),
      scene("moraleja", "un patrón de limpieza, es un patrón hormonal, y por eso ningún producto que se queda"),
      scene("moraleja", "en la superficie lo va a tocar. Lo estabas atacando en el lugar equivocado."),
      scene("moraleja", "Y mientras tanto te sentiste sucia o descuidada por algo que nunca fue tu culpa."),
      scene("solucion", "Si viene de adentro, ahí es donde hay que trabajar. No en la cara."),
      scene("solucion", "Por eso mi bote lleva myo-inositol con zinc, sabor limonada rosa, de Peach Perfect.", true),
      scene("cta", "Escríbeme SOP y te paso la fórmula completa."),
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
    missing.scenes[1] = scene("moraleja", "Ya cambiaste tres veces de crema y vuelve.");
    expect(check(run(missing), "structure")?.ok).toBe(false);

    const shuffled = script();
    shuffled.scenes = [shuffled.scenes[0], shuffled.scenes[2], shuffled.scenes[1], ...shuffled.scenes.slice(3)];
    expect(check(run(shuffled), "structure")?.hard).toBe(true);
  });

  it("keeps the reveal out of the context", () => {
    const early = script();
    early.scenes[1] = scene("contexto", INSIGHT);
    early.scenes[2] = scene("moraleja", "Ya cambiaste tres veces de crema y vuelve.");
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

  it("passes at 5 of 8 and blocks below", () => {
    expect(scoreIdeaCheck({ filters: filters(5), reformulations: ["a", "b"], viralReference: "" }).passed).toBe(true);
    const failed = scoreIdeaCheck({ filters: filters(4), reformulations: ["a", "b", "c"], viralReference: "" });
    expect(failed.passed).toBe(false);
    expect(failed.score).toBe(4);
    expect(failed.reformulations).toEqual(["a", "b"]);
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
    const duo = script({ format: "personaje", hook: "¿Otra crema nueva?" });
    duo.scenes[0] = scene("gancho", "¿Otra crema nueva? Ya van tres este mes.", false, "Amiga");
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
    expect(normalized.scenes[9].voiceover).toContain("sabor limonada rosa, de pich pérfect.");
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
    expect(instructions).toContain("Llevas dos años cambiando de skincare");
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
    expect(buildScriptInput({ idea: "x", product: "inositol", channel: "pagado" })).toContain("Escríbeme SOP");
  });
});
