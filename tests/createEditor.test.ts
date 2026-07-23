// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("toggles display preferences without recreating the document", () => {
    const increaseFontSize = vi.fn();
    const decreaseFontSize = vi.fn();
    editor = createEditor({
      parent: document.body,
      initialDocument: "first\nsecond",
      theme: "light",
      leader: "\\",
      lineNumbers: false,
      fontSize: 16,
      actions: {
        save: () => undefined,
        settings: () => undefined,
        increaseFontSize,
        decreaseFontSize,
        nextTab: () => undefined,
        previousTab: () => undefined,
        selectTab: () => undefined,
      },
      onChange: () => undefined,
      onCursor: () => undefined,
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(editor.view.dom.querySelector(".cm-lineNumbers")).toBeNull();
    editor.setLineNumbers(true);
    expect(editor.view.dom.querySelector(".cm-lineNumbers")?.textContent).toContain("1");
    expect(editor.text()).toBe("first\nsecond");
    editor.setLineNumbers(false);
    expect(editor.view.dom.querySelector(".cm-lineNumbers")).toBeNull();

    editor.setFontSize(20);
    expect(getComputedStyle(editor.view.scrollDOM).fontSize).toBe("20px");
    expect(editor.text()).toBe("first\nsecond");

    const increase = new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true, cancelable: true });
    editor.view.contentDOM.dispatchEvent(increase);
    expect(increase.defaultPrevented).toBe(true);
    expect(increaseFontSize).toHaveBeenCalledTimes(1);
    const decrease = new KeyboardEvent("keydown", { key: "-", ctrlKey: true, bubbles: true, cancelable: true });
    editor.view.contentDOM.dispatchEvent(decrease);
    expect(decrease.defaultPrevented).toBe(true);
    expect(decreaseFontSize).toHaveBeenCalledTimes(1);

    editor.setContext(null, "light");
    const afterFirstContext = dispatch.mock.calls.length;
    editor.setContext(null, "light");
    expect(dispatch).toHaveBeenCalledTimes(afterFirstContext);
    editor.setContext("/notes/file.md", "light");
    expect(dispatch).toHaveBeenCalledTimes(afterFirstContext + 1);
  });

  it("appends streamed text without moving the selection", () => {
    const onChange = vi.fn();
    editor = createEditor({
      parent: document.body,
      initialDocument: "first",
      theme: "light",
      leader: "\\",
      lineNumbers: false,
      fontSize: 16,
      actions: {
        save: () => undefined,
        settings: () => undefined,
        increaseFontSize: () => undefined,
        decreaseFontSize: () => undefined,
        nextTab: () => undefined,
        previousTab: () => undefined,
        selectTab: () => undefined,
      },
      onChange,
      onCursor: () => undefined,
    });
    editor.view.dispatch({ selection: { anchor: 2 } });

    editor.append(" second");

    expect(editor.text()).toBe("first second");
    expect(editor.view.state.selection.main.head).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith("first second");
  });
});
