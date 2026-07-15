import { CodeMirror, Vim, type CodeMirrorV, type MotionArgs, type Pos, type vimState } from "@replit/codemirror-vim";

let configured = false;

function moveByLogicalLines(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos {
  if (vim.lastMotion !== moveByLogicalLines) vim.lastHPos = head.ch;
  const repeat = Math.max(0, motionArgs.repeat + (motionArgs.repeatOffset ?? 0));
  const direction = motionArgs.forward ? 1 : -1;
  const line = Math.max(cm.firstLine(), Math.min(cm.lastLine(), head.line + direction * repeat));
  const text = cm.getLine(line);
  const preferredColumn = Number.isFinite(vim.lastHPos) ? vim.lastHPos : head.ch;
  const ch = Math.min(preferredColumn, Math.max(0, text.length - 1));
  return new CodeMirror.Pos(line, ch);
}

export function configureLogicalLineMotions(): void {
  if (configured) return;
  Vim.defineMotion("markdownThingLogicalLine", moveByLogicalLines);
  Vim.mapCommand("j", "motion", "markdownThingLogicalLine", { forward: true, linewise: true }, {});
  Vim.mapCommand("k", "motion", "markdownThingLogicalLine", { forward: false, linewise: true }, {});
  configured = true;
}
