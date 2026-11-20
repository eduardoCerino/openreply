import { describe, it, expect } from "vitest";
import { buildDirectClipPrompt, buildDirectFramePrompt, directModelProduct, splitDuration, type DirectPlan } from "../lib/video/direct";

describe("splitDuration", () => {
  it("keeps short videos in one clip", () => {
    expect(splitDuration(10)).toEqual([10]);
    expect(splitDuration(15)).toEqual([15]);
  });

  it("splits into the fewest clips of at most 15 s, as even as possible", () => {
    expect(splitDuration(30)).toEqual([15, 15]);
    expect(splitDuration(20)).toEqual([10, 10]);
    expect(splitDuration(25)).toEqual([13, 12]);
    expect(splitDuration(31)).toEqual([11, 10, 10]);
    expect(splitDuration(60)).toEqual([15, 15, 15, 15]);
  });
});

const plan: DirectPlan = {
  firstFramePrompt: "A woman in the driver's seat of a parked car, daylight.",
  productVisible: false,
  segments: [
    { seconds: 15, script: '0:00–0:03 — HOOK\n"Mi amiga va al gym tres veces a la semana."' },
    { seconds: 15, script: '0:00–0:15\n"No era genética."' },
  ],
};

describe("buildDirectClipPrompt", () => {
  it("puts the part, the context and that part's script together", () => {
    const prompt = buildDirectClipPrompt("SETTING — INSIDE HER CAR", plan, 0);
    expect(prompt).toContain("PART 1 OF 2");
    expect(prompt).toContain("exactly 15 seconds, vertical 9:16");
    expect(prompt).toContain("SETTING — INSIDE HER CAR");
    expect(prompt).toContain("Mi amiga va al gym");
    expect(prompt).not.toContain("No era genética");
  });

  it("tells later parts to continue the same take from the last frame", () => {
    const prompt = buildDirectClipPrompt("ctx", plan, 1);
    expect(prompt).toContain("PART 2 OF 2");
    expect(prompt).toContain("last frame of the previous part");
    expect(prompt).toContain("No era genética");
  });

  it("has no part header for a single clip", () => {
    const single = { ...plan, segments: [plan.segments[0]] };
    expect(buildDirectClipPrompt("ctx", single, 0)).not.toContain("PART");
  });
});

describe("buildDirectFramePrompt", () => {
  it("keeps the model's identity when there is a reference", () => {
    const prompt = buildDirectFramePrompt(plan, { model: true, product: false });
    expect(prompt).toContain("MODEL reference");
    expect(prompt).toContain("No supplement tub");
    expect(prompt).toContain("parked car");
    expect(prompt).toContain("SAME person as in image 1");
    expect(prompt).toContain("image 1 wins");
  });

  it("works from the context alone without references", () => {
    const prompt = buildDirectFramePrompt({ ...plan, productVisible: true }, { model: false, product: true });
    expect(prompt).not.toContain("MODEL reference");
    expect(prompt).toContain("Image 1 = PRODUCT reference");
  });
});

describe("directModelProduct", () => {
  it("always picks a model photo", () => {
    expect(directModelProduct({ product: "inositol", modelProduct: "creatina" })).toBe("inositol");
    expect(directModelProduct({ product: "ninguno", modelProduct: "inositol" })).toBe("inositol");
    expect(directModelProduct({ product: "ninguno", modelProduct: null })).toBe("creatina");
  });
});
