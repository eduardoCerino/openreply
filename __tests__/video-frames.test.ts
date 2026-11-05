import { describe, it, expect } from "vitest";
import { buildFramePrompt } from "../lib/video/frames";
import type { VideoScene, VideoScript } from "../lib/video/prompt";

const scene: VideoScene = {
  section: "contexto",
  startSecond: 5,
  endSecond: 10,
  lines: [],
  voiceover: "",
  onScreenText: "",
  visual: "",
  shots: ["0-2.5 s: close-up of her face", "2.5-5 s: medium shot, she turns to camera"],
  productVisible: false,
  startFramePrompt: "the woman from the model reference in a gym, looking at the mirror",
  endFramePrompt: "same shot, she turns to the camera",
  motionPrompt: "",
};
const script = { visualStyle: "natural light, soft peach tones" } as VideoScript;
const ref = (label: string) => ({ label, data: new Uint8Array([1]), mimeType: "image/webp" });

describe("buildFramePrompt", () => {
  it("labels each reference and keeps the model's identity", () => {
    const prompt = buildFramePrompt({ script, scene, position: "inicio", references: [ref("MODEL reference (the woman on screen)")] });
    expect(prompt).toContain("Image 1 = MODEL reference");
    expect(prompt).toContain("same person as the MODEL reference");
    expect(prompt).toContain("Camera: 0-2.5 s: close-up of her face.");
    expect(prompt).toContain("No supplement tub");
    expect(prompt).toContain("No on-screen text");
  });

  it("adds the product and the start frame for an end frame", () => {
    const prompt = buildFramePrompt({
      script,
      scene: { ...scene, productVisible: true },
      position: "final",
      references: [ref("MODEL reference (the woman on screen)"), ref("PRODUCT reference (the tub)"), ref("START FRAME of this shot")],
    });
    expect(prompt).toContain("Image 2 = PRODUCT reference");
    expect(prompt).toContain("Image 3 = START FRAME");
    expect(prompt).toContain("exactly like the PRODUCT reference");
    expect(prompt).toContain("LAST frame of the same continuous shot");
    expect(prompt).toContain("Scene: same shot, she turns to the camera");
    expect(prompt).toContain("Camera: 2.5-5 s: medium shot");
  });
});
