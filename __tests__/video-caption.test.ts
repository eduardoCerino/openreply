import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/blog/openai", () => ({
  generateStructured: vi.fn(async () => ({
    value: { caption: "  Lo que nadie te dijo de la pich pérfect 🍑  ", hashtags: ["#creatina", "mujeres fit", "gym"] },
    model: "test",
  })),
}));

import { generateVideoCaption } from "../lib/video/caption";

describe("generateVideoCaption", () => {
  it("joins the caption and hashtags, in the written spelling", async () => {
    const result = await generateVideoCaption({ script: "Hola", product: "creatina" });
    expect(result.caption).toContain("Peach Perfect");
    expect(result.text).toBe(`${result.caption}\n\n#creatina #mujeresfit #gym`);
  });
});
