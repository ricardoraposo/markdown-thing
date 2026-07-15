import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { TaskList } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { taskToggleChange } from "../src/editor/taskToggle";

function taskState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: [TaskList] })] });
}

describe("taskToggleChange", () => {
  it("checks and unchecks a task on the current line", () => {
    expect(taskToggleChange(taskState("- [ ] open"), 8)).toEqual({ from: 3, insert: "x" });
    expect(taskToggleChange(taskState("  - [X] done"), 12)).toEqual({ from: 5, insert: " " });
  });

  it("toggles a task nested in a blockquote", () => {
    expect(taskToggleChange(taskState("> - [ ] quoted"), 12)).toEqual({ from: 5, insert: "x" });
  });

  it("ignores ordinary, ordered, and fenced-code lookalikes", () => {
    expect(taskToggleChange(taskState("- ordinary"), 4)).toBeNull();
    expect(taskToggleChange(taskState("1. [ ] ordered"), 10)).toBeNull();
    expect(taskToggleChange(taskState("```\n- [ ] code\n```"), 10)).toBeNull();
  });
});
