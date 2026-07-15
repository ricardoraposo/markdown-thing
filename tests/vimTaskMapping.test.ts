// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { afterEach, describe, expect, it } from "vitest";
import { taskLeaderBinding } from "../src/editor/vimTaskMapping";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function press(key: string): void {
  view?.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("task Vim mapping", () => {
  it("toggles the current task with the configured leader followed by x", () => {
    view = new EditorView({
      state: EditorState.create({ doc: "- [ ] task", extensions: [vim(), taskLeaderBinding(",")] }),
      parent: document.body,
    });

    press(",");
    press("x");

    expect(view.state.doc.toString()).toBe("- [x] task");
  });

  it("does not intercept the leader sequence in Insert mode", () => {
    view = new EditorView({
      state: EditorState.create({ doc: "- [ ] task", extensions: [vim(), taskLeaderBinding(",")] }),
      parent: document.body,
    });

    press("i");
    press(",");
    press("x");

    expect(view.state.doc.toString()).toBe("- [ ] task");
  });
});
