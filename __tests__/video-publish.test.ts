import { describe, it, expect } from "vitest";
import { buildCaption, validateCaption } from "../lib/video/publish";
import { buildFfmpegArgs } from "../lib/video/render";

describe("buildCaption", () => {
  it("joins the script caption and its hashtags", () => {
    expect(
      buildCaption({ caption: "Si te pasa, escríbeme CREATINA.", hashtags: ["creatina", "#gym", "vida fit"] })
    ).toBe("Si te pasa, escríbeme CREATINA.\n\n#creatina #gym #vidafit");
  });

  it("returns an empty caption without a script", () => {
    expect(buildCaption(null)).toBe("");
  });
});

describe("validateCaption", () => {
  it("accepts a normal caption", () => {
    expect(validateCaption("Hola #uno #dos")).toBeNull();
  });

  it("rejects more than 30 hashtags or 2200 characters", () => {
    expect(validateCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))).toMatch(/30 hashtags/);
    expect(validateCaption("a".repeat(2201))).toMatch(/2200/);
  });
});

describe("buildFfmpegArgs", () => {
  it("concatenates every clip with audio and encodes to the Reels spec", () => {
    const args = buildFfmpegArgs(["a.mp4", "b.mp4", "c.mp4"], "out.mp4");
    expect(args.filter((arg) => arg === "-i")).toHaveLength(3);
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]");
    expect(filter).toContain("scale=720:1280");
    expect(args).toEqual(expect.arrayContaining(["libx264", "aac", "+faststart"]));
    expect(args.at(-1)).toBe("out.mp4");
  });
});
