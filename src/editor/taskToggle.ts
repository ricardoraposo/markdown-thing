import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

export interface TaskToggleChange {
  from: number;
  insert: " " | "x";
}

function taskMarkerAt(state: EditorState, position: number): SyntaxNode | null {
  const line = state.doc.lineAt(position);
  const side = position === line.to ? -1 : 1;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, side);
  while (node && node.name !== "ListItem") node = node.parent;
  if (!node || node.parent?.name !== "BulletList") return null;
  const task = node.getChild("Task");
  return task?.getChild("TaskMarker") ?? null;
}

export function taskToggleChange(state: EditorState, position = state.selection.main.head): TaskToggleChange | null {
  const marker = taskMarkerAt(state, position);
  if (!marker) return null;
  const value = state.sliceDoc(marker.from, marker.to);
  if (!/^\[[ xX]\]$/.test(value)) return null;
  return {
    from: marker.from + 1,
    insert: value[1] === " " ? "x" : " ",
  };
}

export function toggleTask(view: EditorView, position = view.state.selection.main.head): boolean {
  const change = taskToggleChange(view.state, position);
  if (!change) return false;
  view.dispatch({ changes: { from: change.from, to: change.from + 1, insert: change.insert } });
  return true;
}
