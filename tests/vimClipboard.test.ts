// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type MarkdownEditor } from "../src/editor/createEditor";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

let editor: MarkdownEditor | null = null;
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText },
  });
  writeText.mockClear();
});

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function press(key: string, options: KeyboardEventInit = {}): void {
  editor?.view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  }));
}

function create(source: string): MarkdownEditor {
  return createEditor({
    parent: document.body,
    initialDocument: source,
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
}

describe("Vim clipboard yanks", () => {
  it("copies a yy line yank to the system clipboard", async () => {
    editor = create("first line\nsecond line");

    press("y");
    press("y");

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("first line\n"));
    expect(editor.text()).toBe("first line\nsecond line");
  });

  it("copies motion and visual yanks", async () => {
    editor = create("alpha beta");

    press("y");
    press("w");
    await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("alpha "));

    writeText.mockClear();
    press("0");
    press("v");
    press("l");
    press("l");
    press("y");
    await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("alp"));
  });

  it("does not duplicate explicit clipboard-register yanks", async () => {
    editor = create("shared\n");

    press("\"");
    press("+");
    press("y");
    press("y");

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("shared\n");
  });

  it("does not copy black-hole yanks and ignores clipboard failures", async () => {
    editor = create("private\n");

    press("\"");
    press("_");
    press("y");
    press("y");
    expect(writeText).not.toHaveBeenCalled();

    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    press("y");
    press("y");
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("private\n"));
    expect(editor.text()).toBe("private\n");
  });
});
