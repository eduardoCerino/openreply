import { describe, it, expect } from "vitest";
import { getBrandContext } from "../lib/video/config";
import { buildScriptInput, buildScriptInstructions, type VideoScript } from "../lib/video/prompt";
import { normalizeScript, runFormatChecks, runScriptChecks } from "../lib/video/script";

function scene(
  section: VideoScript["scenes"][number]["section"],
  text: string,
  productVisible = false,
  speaker = "Ella"
) {
  return {
    section,
    startSecond: 99,
    endSecond: 99,
    lines: [{ speaker, text, direction: "" }],
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

function script(overrides: Partial<VideoScript> = {}): VideoScript {
  return {
    title: "Acné en la mandíbula",
    format: "hac",
    formatReason: "Explica un mecanismo, mejor a cámara.",
    onScreenComment: "",
    hookMold: "propio",
    hook: "¿Por qué siempre en la mandíbula?",
    symptom: "acné en la mandíbula que no se va con skincare",
    newInsight: INSIGHT,
    feltLine: FELT,
    character: "",
    visualStyle: "",
    scenes: [
      scene("gancho", "¿Por qué siempre en la mandíbula y siempre la semana antes de que te baje?"),
      scene("contexto", INSIGHT),
      scene("contexto", FELT),
      scene("aterrizaje", "Por eso existe Peach Perfect Inositol en polvo, con myo y d-chiro en proporción 80:1.", true),
      scene("cierre", "Escríbeme SOP y te paso la fórmula completa."),
    ],
    cta: "Escríbeme SOP y te paso la fórmula completa",
    caption: "",
    hashtags: ["sop", "#acne hormonal"],
    storyFollowUps: [],
    ...overrides,
  };
}

const ok = (checks: ReturnType<typeof runScriptChecks>, id: string) => checks.find((c) => c.id === id)?.ok;

describe("normalizeScript", () => {
  it("forces 5-second consecutive timings and clean hashtags", () => {
    const normalized = normalizeScript(script());
    expect(normalized.scenes.map((s) => [s.startSecond, s.endSecond])).toEqual([
      [0, 5], [5, 10], [10, 15], [15, 20], [20, 25],
    ]);
    expect(normalized.hashtags).toEqual(["#sop", "#acnehormonal"]);
  });
});

describe("runScriptChecks", () => {
  it("passes a script that follows the method", () => {
    const checks = runScriptChecks(normalizeScript(script()), "inositol", "organico");
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("flags brochure verbs", () => {
    const bad = script();
    bad.scenes[1] = scene("contexto", "El skincare actúa en la superficie y tu cuerpo requiere más.");
    const check = runScriptChecks(normalizeScript(bad), "inositol", "organico").find((c) => c.id === "brochure");
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain("actua");
  });

  it("requires the new insight and the felt line inside the body", () => {
    const bad = script({ newInsight: "", feltLine: "Una frase que no está en el guion." });
    const checks = runScriptChecks(normalizeScript(bad), "inositol", "organico");
    expect(ok(checks, "insight")).toBe(false);
    expect(ok(checks, "felt")).toBe(false);
  });

  it("flags effects attributed to the product", () => {
    const bad = script();
    bad.scenes[3] = scene("aterrizaje", "Peach Perfect Inositol te ayuda a equilibrar tus hormonas.", true);
    expect(ok(runScriptChecks(normalizeScript(bad), "inositol", "organico"), "productEffect")).toBe(false);
  });

  it("flags medical claims and time-bound promises but allows time data", () => {
    const claim = script({ caption: "El inositol regulariza tu ciclo." });
    expect(ok(runScriptChecks(normalizeScript(claim), "inositol", "organico"), "claims")).toBe(false);
    const promise = script({ caption: "En 8 semanas vas a ver la diferencia." });
    expect(ok(runScriptChecks(normalizeScript(promise), "inositol", "organico"), "claims")).toBe(false);
    const data = script({ caption: "Aparece la semana antes de que te baje. Se trata de un patrón." });
    expect(ok(runScriptChecks(normalizeScript(data), "inositol", "organico"), "claims")).toBe(true);
  });

  it("flags a script far under the word budget", () => {
    const thin = script();
    thin.scenes[1] = scene("contexto", INSIGHT.slice(0, 20));
    thin.scenes[2] = scene("contexto", "Ok.");
    const check = runScriptChecks(normalizeScript(thin), "inositol", "organico").find((c) => c.id === "words");
    expect(check?.ok).toBe(false);
  });

  it("flags the brand in the hook and the product before landing", () => {
    const bad = script();
    bad.scenes[0] = scene("gancho", "Peach Perfect tiene el mejor inositol", true);
    const checks = runScriptChecks(normalizeScript(bad), "inositol", "organico");
    expect(ok(checks, "hook")).toBe(false);
    expect(ok(checks, "product")).toBe(false);
  });

  it("flags a missing CTA keyword and forbidden phrases", () => {
    const bad = script({ cta: "Sígueme para más" });
    bad.scenes[4] = scene("cierre", "Sígueme para más tips.");
    const checks = runScriptChecks(normalizeScript(bad), "inositol", "organico");
    expect(ok(checks, "cta")).toBe(false);
    expect(ok(checks, "forbidden")).toBe(false);
  });

  it("flags second person about the condition in paid ads only", () => {
    const paid = script();
    paid.scenes[1] = scene("contexto", "Si tienes SOP, tu ciclo no es normal.");
    expect(ok(runScriptChecks(normalizeScript(paid), "inositol", "pagado"), "paid")).toBe(false);
    expect(runScriptChecks(normalizeScript(paid), "inositol", "organico").find((c) => c.id === "paid")).toBeUndefined();
  });
});

describe("script prompt", () => {
  it("embeds the brand document and the fixed CTA", () => {
    const instructions = buildScriptInstructions(getBrandContext());
    expect(instructions).toContain("Peach Perfect MX — Contexto de marca");
    expect(instructions).toContain("5 escenas de 5 segundos");
    expect(instructions).toContain("Prohibido el verbo de folleto");
    expect(instructions).toContain("60 a 75 palabras");
    const input = buildScriptInput({ idea: "x", product: "inositol", channel: "pagado" });
    expect(input).toContain("Escríbeme SOP y te paso la fórmula completa");
    expect(input).toContain("ANUNCIO PAGADO");
  });
});

describe("video formats", () => {
  it("joins dialogue lines into the scene voiceover and keeps the chosen format", () => {
    const raw = script({ format: "vof" });
    raw.scenes[1] = {
      ...scene("contexto", "Primera parte."),
      lines: [
        { speaker: "Ella", text: "Primera parte.", direction: "[mira a cámara]" },
        { speaker: "Ella", text: "Segunda parte.", direction: "" },
      ],
    };
    const normalized = normalizeScript(raw, "personaje");
    expect(normalized.format).toBe("personaje");
    expect(normalized.scenes[1].voiceover).toBe("Primera parte. Segunda parte.");
    expect(normalized.scenes[1].lines[0].direction).toBe("mira a cámara");
  });

  it("requires two speakers in dialogue formats, with roles split", () => {
    const solo = normalizeScript(script(), "personaje");
    const check = (checks: ReturnType<typeof runFormatChecks>, id: string) => checks.find((c) => c.id === id)?.ok;
    expect(check(runFormatChecks(solo), "dialogue")).toBe(false);

    const duo = script({ format: "personaje", hook: "¿Otra crema nueva?" });
    duo.scenes[0] = scene("gancho", "¿Otra crema nueva? Ya van tres este mes.", false, "Amiga");
    duo.scenes[1] = scene("contexto", INSIGHT, false, "La que sabe");
    duo.scenes[2] = scene("contexto", FELT, false, "Amiga");
    const checks = runFormatChecks(normalizeScript(duo));
    expect(check(checks, "dialogue")).toBe(true);
    expect(check(checks, "dialogueHook")).toBe(true);
    expect(check(checks, "dialogueRoles")).toBe(true);
  });

  it("needs the on-screen comment in reactions and counts her first line as body", () => {
    const reaction = script({ format: "reaccion", onScreenComment: "" });
    expect(runFormatChecks(normalizeScript(reaction)).find((c) => c.id === "comment")?.ok).toBe(false);

    const withComment = script({ format: "reaccion", onScreenComment: "¿Y si ya probé todo el skincare?" });
    withComment.scenes[0] = scene("gancho", INSIGHT);
    withComment.scenes[1] = scene("contexto", "Te lo explico rápido, porque nadie te lo dice así de claro.");
    const checks = runScriptChecks(normalizeScript(withComment), "inositol", "organico");
    expect(checks.find((c) => c.id === "comment")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "insight")?.ok).toBe(true);
  });

  it("offers every format and the selection table in the prompt", () => {
    const instructions = buildScriptInstructions(getBrandContext());
    expect(instructions).toContain("Regla madre");
    expect(instructions).toContain("reaccion —");
    expect(instructions).toContain("Objeción que ya le hicieron → reaccion");
    expect(buildScriptInput({ idea: "x", product: "creatina", channel: "organico", format: "pov" })).toContain(
      "Formato: pov"
    );
    expect(buildScriptInput({ idea: "x", product: "creatina", channel: "organico", format: "auto" })).toContain(
      "Formato: auto"
    );
  });
});
