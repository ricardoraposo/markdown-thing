import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { taskToggleChange } from "../src/editor/taskToggle";

describe("taskToggleChange", () => {
  it("checks and unchecks a task on the current line", () => {
    const open = EditorState.create({ doc: "- [ ] open" });
    expect(taskToggleChange(open, 8)).toEqual({ from: 3, insert: "x" });

    const done = EditorState.create({ doc: "  - [X] done" });
    expect(taskToggleChange(done, 12)).toEqual({ from: 5, insert: " " });
  });

  it("ignores ordinary bullet items", () => {
    const state = EditorState.create({ doc: "- ordinary" });
    expect(taskToggleChange(state, 4)).toBeNull();
  });
});
