import { markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { markdownConstructs, rangeIsActive } from "../src/editor/markdownModel";

function parse(source: string) { return markdownConstructs(source, markdownLanguage.parser.parse(source)); }

describe("markdownConstructs", () => {
  it("finds supported constructs without changing source", () => {
    const source = "# Title\n\nAn *em* and **strong** [link](https://example.com).\n";
    const constructs = parse(source);
    expect(constructs.map(({ kind }) => kind)).toEqual(["heading", "emphasis", "strong", "link"]);
    expect(source).toBe("# Title\n\nAn *em* and **strong** [link](https://example.com).\n");
  });

  it("extracts an image and does not emit a nested link", () => {
    const constructs = parse("![A cat](images/cat.png)");
    expect(constructs).toHaveLength(1);
    expect(constructs[0]).toMatchObject({ kind: "image", text: "A cat", target: "images/cat.png" });
  });

  it("retains an angle-bracket image destination for non-mutating resolution", () => {
    const source = "![Remote](<https://example.com/image.png>)";
    expect(parse(source)[0]).toMatchObject({ kind: "image", target: "<https://example.com/image.png>" });
    expect(source).toBe("![Remote](<https://example.com/image.png>)");
  });

  it("keeps adjacent and nested emphasis ranges ordered", () => {
    const constructs = parse("***both*** *one**two***");
    expect(constructs.map(({ from }) => from)).toEqual([...constructs.map(({ from }) => from)].sort((a, b) => a - b));
  });

  it("does not hide incomplete syntax", () => {
    expect(parse("A **half finished")).toEqual([]);
  });
});

describe("rangeIsActive", () => {
  const construct = { from: 4, to: 10 };
  it("includes cursor positions on either boundary", () => {
    expect(rangeIsActive(construct, [{ from: 4, to: 4 }])).toBe(true);
    expect(rangeIsActive(construct, [{ from: 10, to: 10 }])).toBe(true);
  });
  it("supports multiple selections", () => {
    expect(rangeIsActive(construct, [{ from: 0, to: 1 }, { from: 7, to: 8 }])).toBe(true);
  });
  it("ignores non-intersecting selections", () => {
    expect(rangeIsActive(construct, [{ from: 0, to: 3 }, { from: 11, to: 12 }])).toBe(false);
  });
});
