import type { Tree } from "@lezer/common";

export type PreviewKind = "heading" | "emphasis" | "strong" | "link" | "image" | "mermaid";

export interface TextRange {
  from: number;
  to: number;
}

export interface PreviewConstruct extends TextRange {
  kind: PreviewKind;
  level?: number;
  markers: TextRange[];
  text?: string;
  target?: string;
}

function children(node: import("@lezer/common").SyntaxNode): import("@lezer/common").SyntaxNode[] {
  const result: import("@lezer/common").SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

export function markdownConstructs(source: string, tree: Tree): PreviewConstruct[] {
  const constructs: PreviewConstruct[] = [];
  tree.iterate({
    enter(nodeRef) {
      const node = nodeRef.node;
      const name = node.name;
      const parts = children(node);
      if (/^ATXHeading[1-6]$/.test(name)) {
        const mark = parts.find((part) => part.name === "HeaderMark");
        if (mark) constructs.push({ kind: "heading", from: node.from, to: node.to, level: Number(name.at(-1)), markers: [{ from: mark.from, to: mark.to }] });
      } else if (name === "Emphasis" || name === "StrongEmphasis") {
        const markers = parts.filter((part) => part.name === "EmphasisMark").map(({ from, to }) => ({ from, to }));
        if (markers.length === 2) constructs.push({ kind: name === "Emphasis" ? "emphasis" : "strong", from: node.from, to: node.to, markers });
      } else if (name === "Link") {
        const marks = parts.filter((part) => part.name === "LinkMark");
        const url = parts.find((part) => part.name === "URL");
        if (marks.length >= 4 && url) {
          const closeLabel = marks[1];
          if (closeLabel) constructs.push({ kind: "link", from: node.from, to: node.to, markers: [{ from: marks[0]!.from, to: marks[0]!.to }, { from: closeLabel.from, to: node.to }], target: source.slice(url.from, url.to) });
        }
      } else if (name === "Image") {
        const marks = parts.filter((part) => part.name === "LinkMark");
        const url = parts.find((part) => part.name === "URL");
        if (marks.length >= 4 && url) {
          constructs.push({ kind: "image", from: node.from, to: node.to, markers: [], text: source.slice(marks[0]!.to, marks[1]!.from), target: source.slice(url.from, url.to) });
          return false;
        }
      } else if (name === "FencedCode") {
        const info = parts.find((part) => part.name === "CodeInfo");
        const code = parts.find((part) => part.name === "CodeText");
        const fences = parts.filter((part) => part.name === "CodeMark");
        if (info && code && fences.length === 2 && source.slice(info.from, info.to).trim().toLowerCase() === "mermaid") {
          constructs.push({ kind: "mermaid", from: node.from, to: node.to, markers: [], text: source.slice(code.from, code.to) });
          return false;
        }
      }
      return undefined;
    },
  });
  return constructs.sort((a, b) => a.from - b.from || b.to - a.to);
}

export function rangeIsActive(range: TextRange, selections: readonly TextRange[]): boolean {
  return selections.some((selection) => selection.from <= range.to && selection.to >= range.from);
}
