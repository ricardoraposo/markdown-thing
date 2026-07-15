import type { Tree } from "@lezer/common";

export type PreviewKind = "heading" | "emphasis" | "strong" | "link" | "image" | "mermaid" | "bullet" | "divider" | "task" | "table" | "inlineCode" | "codeBlock";

export type TableAlignment = "left" | "center" | "right" | null;
export type TableInlineKind = "text" | "code" | "strong" | "emphasis" | "link";

export interface TableInlinePart {
  kind: TableInlineKind;
  text: string;
  target?: string;
}

export interface TableCellPreview {
  from: number;
  to: number;
  source: string;
  parts: TableInlinePart[];
}

export interface TablePreview {
  alignments: TableAlignment[];
  header: TableCellPreview[];
  rows: TableCellPreview[][];
}

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
  checked?: boolean;
  togglePos?: number;
  language?: string;
  editPos?: number;
  editTo?: number;
  editSuffix?: string;
  table?: TablePreview;
}

type SyntaxNode = import("@lezer/common").SyntaxNode;

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function unescapeTablePipes(value: string): string {
  return value.replace(/\\\|/g, "|");
}

function tableInlineParts(source: string, cell: SyntaxNode): TableInlinePart[] {
  const result: TableInlinePart[] = [];
  const add = (kind: TableInlineKind, text: string, target?: string): void => {
    if (text) result.push({ kind, text, ...(target ? { target } : {}) });
  };
  let cursor = cell.from;
  for (const child of children(cell)) {
    if (cursor < child.from) add("text", source.slice(cursor, child.from));
    const parts = children(child);
    if (child.name === "Escape") {
      add("text", source.slice(child.from + 1, child.to));
    } else if (child.name === "InlineCode") {
      const marks = parts.filter((part) => part.name === "CodeMark");
      add("code", unescapeTablePipes(marks.length === 2 ? source.slice(marks[0]!.to, marks[1]!.from) : source.slice(child.from, child.to)));
    } else if (child.name === "StrongEmphasis" || child.name === "Emphasis") {
      const marks = parts.filter((part) => part.name === "EmphasisMark");
      add(child.name === "StrongEmphasis" ? "strong" : "emphasis", unescapeTablePipes(marks.length === 2 ? source.slice(marks[0]!.to, marks[1]!.from) : source.slice(child.from, child.to)));
    } else if (child.name === "Link") {
      const marks = parts.filter((part) => part.name === "LinkMark");
      const url = parts.find((part) => part.name === "URL");
      add("link", unescapeTablePipes(marks.length >= 2 ? source.slice(marks[0]!.to, marks[1]!.from) : source.slice(child.from, child.to)), url ? source.slice(url.from, url.to) : undefined);
    } else {
      add("text", source.slice(child.from, child.to));
    }
    cursor = child.to;
  }
  if (cursor < cell.to) add("text", source.slice(cursor, cell.to));
  return result.length ? result : [{ kind: "text", text: source.slice(cell.from, cell.to) }];
}

function tableCells(source: string, row: SyntaxNode): TableCellPreview[] {
  const parts = children(row);
  const cells = parts.filter((child) => child.name === "TableCell");
  const delimiters = parts.filter((child) => child.name === "TableDelimiter");
  const hasLeftEdge = delimiters[0]?.from === row.from;
  const hasRightEdge = delimiters.at(-1)?.to === row.to;
  const separators = delimiters.slice(hasLeftEdge ? 1 : 0, hasRightEdge ? -1 : undefined);
  const starts = [hasLeftEdge ? delimiters[0]!.to : row.from, ...separators.map(({ to }) => to)];
  const ends = [...separators.map(({ from }) => from), hasRightEdge ? delimiters.at(-1)!.from : row.to];
  return starts.map((from, index) => {
    const to = ends[index] ?? from;
    const cell = cells.find((candidate) => candidate.from >= from && candidate.to <= to);
    return {
      from,
      to,
      source: source.slice(from, to),
      parts: cell ? tableInlineParts(source, cell) : [{ kind: "text", text: "" }],
    };
  });
}

function tableAlignment(source: string, delimiter: SyntaxNode): TableAlignment[] {
  const line = source.slice(delimiter.from, delimiter.to).trim().replace(/^\||\|$/g, "");
  return line.split("|").map((cell) => {
    const marker = cell.trim();
    if (marker.startsWith(":") && marker.endsWith(":")) return "center";
    if (marker.endsWith(":")) return "right";
    if (marker.startsWith(":")) return "left";
    return null;
  });
}

export function markdownConstructs(source: string, tree: Tree): PreviewConstruct[] {
  const constructs: PreviewConstruct[] = [];
  tree.iterate({
    enter(nodeRef) {
      const node = nodeRef.node;
      const name = node.name;
      const parts = children(node);
      if (name === "Table") {
        const header = parts.find((part) => part.name === "TableHeader");
        const delimiter = parts.find((part) => part.name === "TableDelimiter");
        if (header && delimiter) {
          constructs.push({
            kind: "table",
            from: node.from,
            to: node.to,
            markers: [],
            text: source.slice(node.from, node.to),
            editPos: header.from,
            table: {
              alignments: tableAlignment(source, delimiter),
              header: tableCells(source, header),
              rows: parts.filter((part) => part.name === "TableRow").map((row) => tableCells(source, row)),
            },
          });
          return false;
        }
      } else if (name === "ListItem" && node.parent?.name === "BulletList") {
        const listMark = parts.find((part) => part.name === "ListMark");
        const task = parts.find((part) => part.name === "Task");
        const taskMarker = task?.firstChild?.name === "TaskMarker" ? task.firstChild : null;
        if (listMark && taskMarker) {
          const marker = source.slice(taskMarker.from, taskMarker.to);
          constructs.push({
            kind: "task",
            from: node.from,
            to: node.to,
            markers: [{ from: listMark.from, to: taskMarker.to }],
            checked: /^\[[xX]\]$/.test(marker),
            togglePos: taskMarker.from + 1,
          });
          return false;
        }
        if (listMark) {
          constructs.push({ kind: "bullet", from: node.from, to: node.to, markers: [{ from: listMark.from, to: listMark.to }] });
        }
      } else if (name === "HorizontalRule") {
        constructs.push({ kind: "divider", from: node.from, to: node.to, markers: [{ from: node.from, to: node.to }] });
        return false;
      } else if (/^ATXHeading[1-6]$/.test(name)) {
        const mark = parts.find((part) => part.name === "HeaderMark");
        if (mark) constructs.push({ kind: "heading", from: node.from, to: node.to, level: Number(name.at(-1)), markers: [{ from: mark.from, to: mark.to }] });
      } else if (name === "InlineCode") {
        const marks = parts.filter((part) => part.name === "CodeMark");
        if (marks.length === 2) {
          constructs.push({ kind: "inlineCode", from: node.from, to: node.to, markers: marks.map(({ from, to }) => ({ from, to })), text: source.slice(marks[0]!.to, marks[1]!.from) });
        }
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
        const language = info ? source.slice(info.from, info.to).trim() : "";
        if (fences.length === 2 && language.toLowerCase() === "mermaid") {
          constructs.push({ kind: "mermaid", from: node.from, to: node.to, markers: [], text: code ? source.slice(code.from, code.to) : "" });
          return false;
        }
        if (fences.length === 2) {
          const closingLineStart = source.lastIndexOf("\n", fences[1]!.from - 1) + 1;
          const codeEndsWithStructuralNewline = Boolean(code && code.to === closingLineStart && source[code.to - 1] === "\n");
          const editableCodeTo = code ? code.to - (codeEndsWithStructuralNewline ? 1 : 0) : closingLineStart;
          constructs.push({
            kind: "codeBlock",
            from: node.from,
            to: node.to,
            markers: [],
            text: code ? source.slice(code.from, editableCodeTo) : "",
            language,
            editPos: code?.from ?? closingLineStart,
            editTo: editableCodeTo,
            editSuffix: code ? "" : "\n",
          });
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

export function blockRangeIsActive(range: TextRange, selections: readonly TextRange[]): boolean {
  return selections.some((selection) => selection.from === selection.to
    ? selection.from > range.from && selection.from < range.to
    : selection.from < range.to && selection.to > range.from);
}
