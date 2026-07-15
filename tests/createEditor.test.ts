// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createEditor, type MarkdownEditor } from "../src/editor/createEditor";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

let editor: MarkdownEditor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.replaceChildren();
});

describe("createEditor", () => {
  it("toggles line numbers without recreating the document", () => {
    editor = createEditor({
      parent: document.body,
      initialDocument: "first\nsecond",
      theme: "light",
      leader: "\\",
      lineNumbers: false,
      actions: {
        save: () => undefined,
        settings: () => undefined,
        nextTab: () => undefined,
        previousTab: () => undefined,
        selectTab: () => undefined,
      },
      onChange: () => undefined,
      onCursor: () => undefined,
    });

    expect(editor.view.dom.querySelector(".cm-lineNumbers")).toBeNull();
    editor.setLineNumbers(true);
    expect(editor.view.dom.querySelector(".cm-lineNumbers")?.textContent).toContain("1");
    expect(editor.text()).toBe("first\nsecond");
    editor.setLineNumbers(false);
    expect(editor.view.dom.querySelector(".cm-lineNumbers")).toBeNull();
  });
});
