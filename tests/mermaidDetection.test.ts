import { markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { markdownConstructs } from "../src/editor/markdownModel";

const constructs = (source: string) => markdownConstructs(source, markdownLanguage.parser.parse(source));

describe("Mermaid detection", () => {
  it("recognizes a case-insensitive mermaid info string", () => {
    expect(constructs("```Mermaid\ngraph LR\nA-->B\n```\n")[0]).toMatchObject({ kind: "mermaid", text: "graph LR\nA-->B" });
  });
  it("does not replace ordinary code fences", () => {
    expect(constructs("```ts\nconst value = 1\n```\n")).toEqual([]);
  });
  it("does not replace an unfinished fence", () => {
    expect(constructs("```mermaid\ngraph LR\n")).toEqual([]);
  });
});
