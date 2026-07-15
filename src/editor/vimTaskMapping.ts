import { getCM } from "@replit/codemirror-vim";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { toggleTask } from "./taskToggle";

interface VimModeState {
  insertMode?: boolean;
  visualMode?: boolean;
  inputState?: { operator?: unknown };
}

export function taskLeaderBinding(leader: string): Extension {
  let waitingForCommand = false;
  let resetTimer: number | undefined;
  const reset = (): void => {
    waitingForCommand = false;
    window.clearTimeout(resetTimer);
  };

  return Prec.highest(EditorView.domEventHandlers({
    keydown(event, view) {
      const cm = getCM(view) as unknown as { state?: { vim?: VimModeState } } | null;
      const vimState = cm?.state?.vim;
      if (!vimState || vimState.insertMode || vimState.visualMode || vimState.inputState?.operator || event.ctrlKey || event.altKey || event.metaKey) {
        reset();
        return false;
      }
      if (!waitingForCommand && event.key === leader) {
        waitingForCommand = true;
        resetTimer = window.setTimeout(reset, 1000);
        return true;
      }
      if (waitingForCommand) {
        reset();
        if (event.key.toLowerCase() === "x") {
          toggleTask(view);
          return true;
        }
      }
      return false;
    },
  }));
}
