import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface TaskToggleChange {
  from: number;
  insert: " " | "x";
}

export function taskToggleChange(state: EditorState, position = state.selection.main.head): TaskToggleChange | null {
  const line = state.doc.lineAt(position);
  const match = /^(\s*[-+*]\s+\[)([ xX])\]/.exec(line.text);
  if (!match?.[1] || !match[2]) return null;
  return {
    from: line.from + match[1].length,
    insert: match[2] === " " ? "x" : " ",
  };
}

export function toggleTask(view: EditorView, position = view.state.selection.main.head): boolean {
  const change = taskToggleChange(view.state, position);
  if (!change) return false;
  view.dispatch({ changes: { from: change.from, to: change.from + 1, insert: change.insert } });
  return true;
}
