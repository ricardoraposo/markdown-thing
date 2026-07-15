// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
import { Table, TaskList } from "@lezer/markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { livePreview } from "../src/editor/livePreview";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

const source = `# Heading

**bold** and *emphasis* with [a link](https://example.com).

![alt](images/example.png)

\`\`\`mermaid
graph LR
A --> B
\`\`\`
`;

describe("livePreview", () => {
  it("hides inactive syntax and reveals the complete construct under the cursor", () => {
    const inline = "**bold** tail";
    const state = EditorState.create({
      doc: inline,
      selection: EditorSelection.cursor(inline.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });
    expect(view.contentDOM.textContent).toContain("bold tail");
    expect(view.contentDOM.textContent).not.toContain("**bold**");
    expect(view.state.doc.toString()).toBe(inline);

    view.dispatch({ selection: EditorSelection.cursor(2) });
    expect(view.contentDOM.textContent).toContain("**bold** tail");
    expect(view.state.doc.toString()).toBe(inline);
  });

  it("renders bullets, dividers, and clickable task checkboxes without changing other source", () => {
    const richSource = "- item\n\n- [ ] task\n\n---\n\nTail";
    const state = EditorState.create({
      doc: richSource,
      selection: EditorSelection.cursor(richSource.length),
      extensions: [markdown({ extensions: [TaskList] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelector(".md-bullet")).not.toBeNull();
    expect(view.dom.querySelector(".md-divider")).not.toBeNull();
    const checkbox = view.dom.querySelector<HTMLButtonElement>(".md-task-checkbox");
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    checkbox?.click();
    expect(view.state.doc.toString()).toBe("- item\n\n- [x] task\n\n---\n\nTail");
  });

  it("renders a GFM table and reveals its source from a keyboard-accessible Edit control", () => {
    const tableSource = "| Name | Value |\n| :--- | ---: |\n| `one` | 1 |\n\nTail";
    const state = EditorState.create({
      doc: tableSource,
      selection: EditorSelection.cursor(tableSource.length),
      extensions: [markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelectorAll(".md-table-wrap th")).toHaveLength(2);
    expect(view.dom.querySelector(".md-table-wrap")?.getAttribute("tabindex")).toBe("0");
    expect(view.dom.querySelector(".md-table-wrap code")?.textContent).toBe("one");
    view.dom.querySelector<HTMLButtonElement>(".md-table-wrap .md-block-action")?.click();
    expect(view.contentDOM.textContent).toContain("| Name | Value |");
    expect(view.state.doc.toString()).toBe(tableSource);
  });

  it("renders inline and fenced code while retaining exact source", () => {
    const codeSource = "Use `inline`.\n\n```ts\nconst x = 1;\n```\n\nTail";
    const state = EditorState.create({
      doc: codeSource,
      selection: EditorSelection.cursor(codeSource.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelector(".md-inline-code")?.textContent).toBe("inline");
    expect(view.dom.querySelector(".md-code-language")?.textContent).toBe("ts");
    expect(view.dom.querySelector(".md-code-block")?.getAttribute("tabindex")).toBe("0");
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toBe("const x = 1;");
    expect(view.dom.querySelectorAll(".md-code-block .md-block-action")).toHaveLength(2);
    expect(view.state.doc.toString()).toBe(codeSource);
  });

  it("keeps hostile table and code content inert", () => {
    const hostile = "| Value |\n| --- |\n| <img src=x onerror=alert(1)> |\n\n```html\n<script>alert(1)</script>\n```\n\nTail";
    const state = EditorState.create({
      doc: hostile,
      selection: EditorSelection.cursor(hostile.length),
      extensions: [markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelector(".md-table-wrap img")).toBeNull();
    expect(view.dom.querySelector(".md-code-block script")).toBeNull();
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toContain("<script>");
  });

  it("survives edits next to hidden marker ranges", () => {
    const state = EditorState.create({ doc: source, selection: EditorSelection.cursor(source.length), extensions: [markdown(), livePreview] });
    const updated = state.update({ changes: { from: source.length, insert: "\nMore" } }).state;
    expect(updated.doc.toString()).toBe(`${source}\nMore`);
  });
});
