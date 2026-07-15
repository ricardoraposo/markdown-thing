// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
import { Table, TaskList } from "@lezer/markdown";
import { cursorCharBackward, cursorCharForward, history, redo, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { livePreview } from "../src/editor/livePreview";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function press(key: string): void {
  view?.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

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

  it("edits raw cell Markdown inside a rendered GFM table", () => {
    const tableSource = "| Name | Value |\n| :--- | ---: |\n| `one` | 1 |\n\nTail";
    const state = EditorState.create({
      doc: tableSource,
      selection: EditorSelection.cursor(tableSource.length),
      extensions: [history(), markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelectorAll(".md-table-wrap th")).toHaveLength(2);
    expect(view.dom.querySelector(".md-table-wrap")?.getAttribute("tabindex")).toBe("0");
    expect(view.dom.querySelector(".md-table-wrap code")?.textContent).toBe("one");
    view.dom.querySelector<HTMLButtonElement>(".md-table-wrap .md-block-action")?.click();
    const input = view.dom.querySelector<HTMLInputElement>(".md-table-cell-input")!;
    expect(input.value).toBe(" Name ");
    input.value = " **Project** ";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    const editedTable = "| **Project** | Value |\n| :--- | ---: |\n| `one` | 1 |\n\nTail";
    expect(view.state.doc.toString()).toBe(editedTable);
    expect(view.dom.querySelector(".md-table-cell-input")).toBe(input);
    undo(view);
    expect(view.state.doc.toString()).toBe(tableSource);
    expect(view.dom.querySelector(".md-table-cell-input")).toBe(input);
    expect(input.value).toBe(" Name ");
    redo(view);
    expect(view.state.doc.toString()).toBe(editedTable);
    expect(view.dom.querySelector(".md-table-cell-input")).toBe(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const editedCell = view.dom.querySelector<HTMLTableCellElement>(".md-table-wrap th");
    expect(editedCell?.querySelector("strong")?.textContent).toBe("Project");
    expect(document.activeElement).toBe(editedCell);
  });

  it("renders and syntax-highlights inline and fenced code while retaining exact source", async () => {
    const codeSource = "Use `inline`.\n\n```ts\nconst x = 1;\n```\n\nTail";
    const state = EditorState.create({
      doc: codeSource,
      selection: EditorSelection.cursor(codeSource.length),
      extensions: [history(), markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelector(".md-inline-code")?.textContent).toBe("inline");
    expect(view.dom.querySelector(".md-code-language")?.textContent).toBe("ts");
    expect(view.dom.querySelector(".md-code-block pre")?.getAttribute("tabindex")).toBe("0");
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toBe("const x = 1;");
    expect(view.dom.querySelectorAll(".md-code-block .md-block-action")).toHaveLength(2);
    await vi.waitFor(() => expect(view?.dom.querySelector(".md-code-block")?.classList.contains("highlighted")).toBe(true), { timeout: 2000 });
    expect(view.dom.querySelector(".md-code-block code span")?.getAttribute("style")).toContain("color");

    const preview = view.dom.querySelector<HTMLPreElement>(".md-code-block pre")!;
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ height: 240 } as DOMRect);
    preview.scrollTop = 12;
    view.dom.querySelector<HTMLButtonElement>("[data-md-code-edit]")?.click();
    const textarea = view.dom.querySelector<HTMLTextAreaElement>(".md-code-editor")!;
    expect(textarea.style.height).toBe("240px");
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.scrollTop).toBe(12);
    textarea.value = "const x = 2;\nconsole.log(x);";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    const editedCode = "Use `inline`.\n\n```ts\nconst x = 2;\nconsole.log(x);\n```\n\nTail";
    expect(view.state.doc.toString()).toBe(editedCode);
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
    undo(view);
    expect(view.state.doc.toString()).toBe(codeSource);
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
    expect(textarea.value).toBe("const x = 1;");
    redo(view);
    expect(view.state.doc.toString()).toBe(editedCode);
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
    view.dom.querySelector<HTMLButtonElement>("[data-md-code-edit]")?.click();
    await vi.waitFor(() => expect(view?.dom.querySelector(".md-code-block")?.classList.contains("highlighted")).toBe(true), { timeout: 2000 });
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toBe("const x = 2;\nconsole.log(x);");
  });

  it("keeps in-place code offsets current after edits before the block", () => {
    const code = "Before\n\n```js\none();\n```\n\nAfter";
    const state = EditorState.create({
      doc: code,
      selection: EditorSelection.cursor(code.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });
    view.dom.querySelector<HTMLButtonElement>("[data-md-code-edit]")?.click();
    const textarea = view.dom.querySelector<HTMLTextAreaElement>(".md-code-editor")!;
    view.dispatch({ changes: { from: 0, insert: "Added\n" } });
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
    textarea.value = "two();";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(view.state.doc.toString()).toBe("Added\nBefore\n\n```js\ntwo();\n```\n\nAfter");
  });

  it("edits an initially empty fenced block without damaging its fences", () => {
    const empty = "Before\n\n```ruby\n```\n\nAfter";
    const state = EditorState.create({
      doc: empty,
      selection: EditorSelection.cursor(empty.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });
    view.dom.querySelector<HTMLButtonElement>("[data-md-code-edit]")?.click();
    const textarea = view.dom.querySelector<HTMLTextAreaElement>(".md-code-editor")!;
    textarea.value = "puts :ok";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(view.state.doc.toString()).toBe("Before\n\n```ruby\nputs :ok\n```\n\nAfter");
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
  });

  it("preserves the structural newline in a blank fenced block", () => {
    const blank = "```js\n\n```\n\nAfter";
    const state = EditorState.create({
      doc: blank,
      selection: EditorSelection.cursor(blank.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });
    view.dom.querySelector<HTMLButtonElement>("[data-md-code-edit]")?.click();
    const textarea = view.dom.querySelector<HTMLTextAreaElement>(".md-code-editor")!;
    expect(textarea.value).toBe("");
    textarea.value = "run();";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(view.state.doc.toString()).toBe("```js\nrun();\n```\n\nAfter");
    expect(view.dom.querySelector(".md-code-editor")).toBe(textarea);
  });

  it("keeps hostile table and code content inert after highlighting", async () => {
    const hostile = "| Value |\n| --- |\n| <img src=x onerror=alert(1)> |\n\n```html\n<script>alert(1)</script>\n```\n\nTail";
    const state = EditorState.create({
      doc: hostile,
      selection: EditorSelection.cursor(hostile.length),
      extensions: [markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    await vi.waitFor(() => expect(view?.dom.querySelector(".md-code-block")?.classList.contains("highlighted")).toBe(true), { timeout: 2000 });
    expect(view.dom.querySelector(".md-table-wrap img")).toBeNull();
    expect(view.dom.querySelector(".md-code-block script")).toBeNull();
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toContain("<script>");
  });

  it("clears the busy state when a code language is unsupported", async () => {
    const unknown = "```made-up-language\nplain text\n```\n\nTail";
    const state = EditorState.create({
      doc: unknown,
      selection: EditorSelection.cursor(unknown.length),
      extensions: [markdown(), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    await vi.waitFor(() => expect(view?.dom.querySelector(".md-code-block")?.getAttribute("aria-busy")).toBe("false"), { timeout: 2000 });
    expect(view.dom.querySelector(".md-code-block")?.classList.contains("highlighted")).toBe(false);
    expect(view.dom.querySelector(".md-code-block code")?.textContent).toBe("plain text");
  });

  it("treats rendered tables as atomic for ordinary cursor navigation", () => {
    const tableSource = "| A |\n| --- |\n| one |\n\nTail";
    const tableEnd = tableSource.indexOf("\n\nTail");
    const state = EditorState.create({
      doc: tableSource,
      selection: EditorSelection.cursor(0),
      extensions: [markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
    cursorCharForward(view);
    expect(view.state.selection.main.head).toBe(tableEnd);
    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
    cursorCharBackward(view);
    expect(view.state.selection.main.head).toBe(0);
    view.dispatch({ selection: EditorSelection.cursor(2) });
    expect(view.dom.querySelector(".md-table-wrap")).toBeNull();
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
    view.dispatch({ selection: EditorSelection.range(0, 5) });
    expect(view.contentDOM.textContent).toContain("| A |");
  });

  it("keeps Vim vertical navigation from expanding a rendered table", () => {
    const tableSource = "Top\n\n| A |\n| --- |\n| one |\n\nTail";
    const tableFrom = tableSource.indexOf("| A |");
    const tableTo = tableSource.indexOf("\n\nTail");
    const state = EditorState.create({
      doc: tableSource,
      selection: EditorSelection.cursor(0),
      extensions: [vim(), markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    press("j");
    press("j");
    let position = view.state.selection.main.head;
    expect(position <= tableFrom || position >= tableTo).toBe(true);
    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
    press("+");
    position = view.state.selection.main.head;
    expect(position <= tableFrom || position >= tableTo).toBe(true);
    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
  });

  it("keeps Vim character navigation from landing inside a rendered table", () => {
    const tableSource = "| A |\n| --- |\n| one |\n\nTail";
    const tableTo = tableSource.indexOf("\n\nTail");
    const state = EditorState.create({
      doc: tableSource,
      selection: EditorSelection.cursor(0),
      extensions: [vim(), markdown({ extensions: [Table] }), livePreview],
    });
    view = new EditorView({ state, parent: document.body });

    press("l");
    expect(view.state.selection.main.head).toBe(tableTo);
    expect(view.dom.querySelector(".md-table-wrap")).not.toBeNull();
  });

  it("survives edits next to hidden marker ranges", () => {
    const state = EditorState.create({ doc: source, selection: EditorSelection.cursor(source.length), extensions: [markdown(), livePreview] });
    const updated = state.update({ changes: { from: source.length, insert: "\nMore" } }).state;
    expect(updated.doc.toString()).toBe(`${source}\nMore`);
  });
});
