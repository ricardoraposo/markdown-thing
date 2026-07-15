import { describe, expect, it } from "vitest";
import { highlightCode } from "../src/editor/shikiHighlighter";

describe("lazy Shiki highlighter", () => {
  it("highlights Ruby and preserves every source character", async () => {
    const source = "def hello(name)\n  puts name\nend";
    const result = await highlightCode(source, "ruby", "dark");

    expect(result).not.toBeNull();
    expect(result?.lines.map((line) => line.map(({ content }) => content).join("")).join("\n")).toBe(source);
    expect(result?.lines.flat().some(({ color }) => Boolean(color))).toBe(true);
  });

  it("supports common aliases and skips unknown languages", async () => {
    expect(await highlightCode("const value: number = 1", "ts", "light")).not.toBeNull();
    expect(await highlightCode("anything", "made-up-language", "dark")).toBeNull();
  });
});
