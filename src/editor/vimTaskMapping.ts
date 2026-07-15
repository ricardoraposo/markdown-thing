import { Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";
import { toggleTask } from "./taskToggle";

const ACTION_NAME = "markdownThingToggleTask";
let installed = false;

export function installTaskVimMapping(): void {
  if (installed) return;
  Vim.defineAction(ACTION_NAME, (cm) => {
    const view = (cm as unknown as { cm6: EditorView }).cm6;
    toggleTask(view);
  });
  Vim.mapCommand("\\x", "action", ACTION_NAME, {}, { context: "normal" });
  installed = true;
}
