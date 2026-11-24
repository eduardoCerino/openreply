import { describe, expect, it } from "vitest";
import { buildAss, expectedSpeech, groupCaptions } from "../lib/video/subtitles";
import { buildSubtitleArgs } from "../lib/video/render";
import { buildDirectClipPrompt, type DirectPlan } from "../lib/video/direct";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("groupCaptions", () => {
  it("makes captions of at most 3 words, broken at punctuation and pauses", () => {
    const captions = groupCaptions([
      w("Esta", 0, 0.2),
      w("es", 0.2, 0.3),
      w("mi", 0.3, 0.4),
      w("creatina", 0.4, 0.9),
      w("favorita.", 0.9, 1.4),
      w("Me", 2.2, 2.3),
      w("la", 2.3, 2.4),
      w("tomo", 2.4, 2.7),
    ]);
    expect(captions.map((caption) => caption.text)).toEqual(["Esta es mi", "creatina favorita", "Me la tomo"]);
    expect(captions[0].end).toBe(0.4);
    expect(captions[1].end).toBe(1.4);
  });

  it("writes the brand with its correct spelling", () => {
    expect(groupCaptions([w("pich", 0, 0.3), w("pérfect", 0.3, 0.8)])[0].text).toBe("Peach Perfect");
  });
});

describe("buildAss", () => {
  it("writes a 720x1280 script with timed dialogue lines", () => {
    const ass = buildAss([{ start: 1.5, end: 62.25, text: "Hola {mundo}" }]);
    expect(ass).toContain("PlayResY: 1280");
    expect(ass).toContain("Dialogue: 0,0:00:01.50,0:01:02.25,Default,,0,0,0,,Hola mundo");
  });
});

describe("expectedSpeech", () => {
  it("keeps only the quoted dialogue", () => {
    expect(expectedSpeech('0:00 — HOOK\n"Esta es mi creatina."\nVOICE: warm\n"Se nota."')).toBe("Esta es mi creatina. Se nota.");
  });
});

describe("buildSubtitleArgs", () => {
  it("draws the .ass file and keeps the audio", () => {
    const args = buildSubtitleArgs("in.mp4", "subs.ass", "out.mp4");
    expect(args).toContain("subtitles=subs.ass");
    expect(args.join(" ")).toContain("-c:a copy");
  });
});

describe("direct clip prompt", () => {
  it("forbids text in the video and extra limbs", () => {
    const plan: DirectPlan = { firstFramePrompt: "x", productVisible: false, segments: [{ seconds: 5, script: '"Hola"' }] };
    const prompt = buildDirectClipPrompt("ON-SCREEN TEXT: big title", plan, 0);
    expect(prompt.startsWith("ABSOLUTELY NO TEXT IN THE VIDEO")).toBe(true);
    expect(prompt).toContain("exactly two arms");
    expect(prompt.trim().endsWith("Subtitles are added later in editing.")).toBe(true);
  });
});
