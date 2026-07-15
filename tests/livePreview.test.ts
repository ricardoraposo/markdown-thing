// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
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

  it("survives edits next to hidden marker ranges", () => {
    const state = EditorState.create({ doc: source, selection: EditorSelection.cursor(source.length), extensions: [markdown(), livePreview] });
    const updated = state.update({ changes: { from: source.length, insert: "\nMore" } }).state;
    expect(updated.doc.toString()).toBe(`${source}\nMore`);
  });
});
