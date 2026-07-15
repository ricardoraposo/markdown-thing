import { CodeMirror, Vim, type CodeMirrorV, type MotionArgs, type Pos, type vimState } from "@replit/codemirror-vim";

let configured = false;

function moveByLogicalLines(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos {
  if (vim.lastMotion !== moveByLogicalLines && vim.lastHPos !== Infinity) vim.lastHPos = head.ch;
  const repeat = Math.max(0, motionArgs.repeat + (motionArgs.repeatOffset ?? 0));
  const direction = motionArgs.forward ? 1 : -1;
  const line = Math.max(cm.firstLine(), Math.min(cm.lastLine(), head.line + direction * repeat));
  const text = cm.getLine(line);
  const lineEnd = Math.max(0, text.length - 1);
  const ch = vim.lastHPos === Infinity ? lineEnd : Math.min(vim.lastHPos, lineEnd);
  return new CodeMirror.Pos(line, ch);
}

export function configureLogicalLineMotions(): void {
  if (configured) return;
  Vim.defineMotion("markdownThingLogicalLine", moveByLogicalLines);
  Vim.mapCommand("j", "motion", "markdownThingLogicalLine", { forward: true, linewise: true }, {});
  Vim.mapCommand("k", "motion", "markdownThingLogicalLine", { forward: false, linewise: true }, {});
  configured = true;
}
