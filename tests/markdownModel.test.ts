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

  it("classifies bullets, dividers, and task markers without changing source", () => {
    const source = "- item\n\n---\n\n- [ ] open\n- [x] done\n";
    const constructs = parse(source);
    expect(constructs.map(({ kind }) => kind)).toEqual(["bullet", "divider", "task", "task"]);
    expect(constructs[2]).toMatchObject({ checked: false });
    expect(constructs[3]).toMatchObject({ checked: true });
    expect(source).toBe("- item\n\n---\n\n- [ ] open\n- [x] done\n");
  });

  it("leaves ordered-list numbers intact and renders quoted bullet tasks", () => {
    expect(parse("1. item\n2. [ ] ordered\n").filter(({ kind }) => kind === "bullet" || kind === "task")).toEqual([]);
    expect(parse("> - [ ] quoted\n").map(({ kind }) => kind)).toEqual(["task"]);
  });

  it("extracts tables, inline code, and ordinary fenced code", () => {
    const source = "| Name | Value |\n| :--- | ---: |\n| `one` | 1 |\n\nUse `inline`.\n\n```ts\nconst x = 1;\n```\n";
    const constructs = parse(source);
    expect(constructs.map(({ kind }) => kind)).toEqual(["table", "inlineCode", "codeBlock"]);
    expect(constructs[0]?.table).toMatchObject({ alignments: ["left", "right"] });
    expect(constructs[0]?.table?.rows[0]?.[0]?.parts).toEqual([{ kind: "code", text: "one" }]);
    expect(constructs[2]).toMatchObject({ language: "ts", text: "const x = 1;" });

    const escapedTable = parse("| A | B |\n| --- | --- |\n| a\\|b | c |\n| `a\\|b` | **a\\|b** |\n")[0]?.table;
    expect(escapedTable?.rows[0]?.[0]?.parts.map(({ text }) => text).join("")).toBe("a|b");
    expect(escapedTable?.rows[1]?.[0]?.parts).toEqual([{ kind: "code", text: "a|b" }]);
    expect(escapedTable?.rows[1]?.[1]?.parts).toEqual([{ kind: "strong", text: "a|b" }]);
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
