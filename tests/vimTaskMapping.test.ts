// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { TaskList } from "@lezer/markdown";
import { afterEach, describe, expect, it } from "vitest";
import { taskToggleChange } from "../src/editor/taskToggle";
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

function taskEditor(): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: "- [ ] task",
      extensions: [vim(), markdown({ extensions: [TaskList] }), taskLeaderBinding(",")],
    }),
    parent: document.body,
  });
}

describe("task Vim mapping", () => {
  it("toggles the current task with the configured leader followed by x", () => {
    view = taskEditor();

    expect(taskToggleChange(view.state)).toEqual({ from: 3, insert: "x" });
    press(",");
    press("x");

    expect(view.state.doc.toString()).toBe("- [x] task");
  });

  it("does not intercept the leader sequence in Insert mode", () => {
    view = taskEditor();

    press("i");
    press(",");
    press("x");

    expect(view.state.doc.toString()).toBe("- [ ] task");
  });
});
