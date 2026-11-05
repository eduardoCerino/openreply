import { describe, it, expect } from "vitest";
import { getBrandContext } from "../lib/video/config";
import { buildScriptInput, buildScriptInstructions, type VideoScript } from "../lib/video/prompt";
import { normalizeScript, runScriptChecks } from "../lib/video/script";

function scene(section: VideoScript["scenes"][number]["section"], voiceover: string, productVisible = false) {
  return {
    section,
    startSecond: 99,
    endSecond: 99,
    voiceover,
    onScreenText: "",
    visual: "",
    productVisible,
    startFramePrompt: "",
    endFramePrompt: "",
    motionPrompt: "",
  };
}

function script(overrides: Partial<VideoScript> = {}): VideoScript {
  return {
    title: "Glúteos que no crecen",
    hookMold: "propio",
    hook: "Llevo meses haciendo sentadillas y mis glúteos siguen igual",
    symptom: "no crecen los glúteos",
    character: "",
    visualStyle: "",
    scenes: [
      scene("gancho", "Llevo meses haciendo sentadillas y mis glúteos siguen igual."),
      scene("contexto", "No es el peso que levantas: es la fuerza que pierdes."),
      scene("contexto", "Sin energía suficiente, el músculo deja de recibir estímulo."),
      scene("aterrizaje", "Por eso tomo la creatina de Peach Perfect con colágeno.", true),
      scene("cierre", "Comenta GLÚTEOS y te mando el link."),
    ],
    cta: "Comenta GLÚTEOS y te mando el link",
    caption: "",
    hashtags: ["gluteos", "#creatina mujeres"],
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
    expect(normalized.hashtags).toEqual(["#gluteos", "#creatinamujeres"]);
  });
});

describe("runScriptChecks", () => {
  it("passes a script that follows the method", () => {
    const checks = runScriptChecks(normalizeScript(script()), "creatina", "organico");
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("flags the brand in the hook and the product before landing", () => {
    const bad = script();
    bad.scenes[0] = scene("gancho", "Peach Perfect tiene la mejor creatina", true);
    const checks = runScriptChecks(normalizeScript(bad), "creatina", "organico");
    expect(ok(checks, "hook")).toBe(false);
    expect(ok(checks, "product")).toBe(false);
  });

  it("flags a missing CTA keyword and forbidden phrases", () => {
    const bad = script({ cta: "Sígueme para más" });
    bad.scenes[4] = scene("cierre", "Sígueme para más tips.");
    const checks = runScriptChecks(normalizeScript(bad), "creatina", "organico");
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
    const input = buildScriptInput({ idea: "x", product: "inositol", channel: "pagado" });
    expect(input).toContain("Escríbeme SOP y te paso la fórmula completa");
    expect(input).toContain("ANUNCIO PAGADO");
  });
});
