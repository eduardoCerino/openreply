import { describe, it, expect } from "vitest";
import { buildClipPrompt } from "../lib/video/clips";
import { CLIP_SETTINGS } from "../lib/video/pruna";
import type { VideoScene, VideoScript } from "../lib/video/prompt";

const scene = (lines: VideoScene["lines"]): VideoScene => ({
  section: "contexto",
  startSecond: 5,
  endSecond: 10,
  lines,
  voiceover: lines.map((line) => line.text).join(" "),
  onScreenText: "",
  visual: "",
  shots: ["0-2.5 s: close-up", "2.5-5 s: medium shot"],
  productVisible: false,
  startFramePrompt: "",
  endFramePrompt: "",
  motionPrompt: "she turns from the mirror to the camera",
});
const script = { visualStyle: "natural light" } as VideoScript;

describe("buildClipPrompt", () => {
  it("animates the frame and asks Pruna to voice the scene's lines", () => {
    const prompt = buildClipPrompt(
      script,
      scene([{ speaker: "Ella", text: "No era la crema. Era otra cosa.", direction: "pausa breve" }])
    );
    expect(prompt).toContain("Animate this exact frame");
    expect(prompt).toContain("Motion: she turns from the mirror to the camera");
    expect(prompt).toContain('saying exactly: "No era la crema. Era otra cosa."');
    expect(prompt).toContain("Mexican Spanish");
    expect(prompt).toContain("short, deliberate pause");
    expect(prompt).toContain("no background music");
  });

  it("labels each speaker in dialogue formats", () => {
    const prompt = buildClipPrompt(
      script,
      scene([
        { speaker: "Amiga", text: "¿Otra vez pierna?", direction: "" },
        { speaker: "Ella", text: "Cinco días esta semana.", direction: "" },
      ])
    );
    expect(prompt).toContain('Amiga: "¿Otra vez pierna?" Ella: "Cinco días esta semana."');
  });

  it("always renders in draft mode at 720p", () => {
    expect(CLIP_SETTINGS).toEqual({ resolution: "720p", draft: true });
  });
});
