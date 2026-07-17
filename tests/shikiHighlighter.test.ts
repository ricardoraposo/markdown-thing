import { describe, expect, it } from "vitest";
import { highlightCode } from "../src/editor/shikiHighlighter";

describe("lazy Shiki highlighter", () => {
  it("highlights Ruby and preserves every source character", async () => {
    const source = "def hello(name)\n  puts name\nend";
    const result = await highlightCode(source, "ruby", "dark");

    expect(result).not.toBeNull();
    expect(result?.lines.map((line) => line.map(({ content }) => content).join("")).join("\n")).toBe(source);
    expect(result?.lines.flat().some(({ color }) => Boolean(color))).toBe(true);
    expect(result?.foreground).toBe("#d8d0c0");
    expect(result?.background).toBe("#1c1b19");
    expect(result?.lines.flat().find(({ content }) => content === "def")?.color?.toLowerCase()).toBe("#e08060");
  });

  it("supports common aliases and skips unknown languages", async () => {
    const lightResult = await highlightCode("const value: number = 1", "ts", "light");
    expect(lightResult).not.toBeNull();
    expect(lightResult?.foreground).toBe("#282418");
    expect(lightResult?.background).toBe("#e6dac4");
    expect(lightResult?.lines.flat().map(({ content }) => content).join("")).toBe("const value: number = 1");
    expect(lightResult?.lines.flat().some(({ color }) => Boolean(color))).toBe(true);
    expect(await highlightCode("anything", "made-up-language", "dark")).toBeNull();
  });
});
