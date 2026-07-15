import { syntaxTree } from "@codemirror/language";
import { CodeMirror, Vim, type CodeMirrorV, type InputStateInterface, type MotionArgs, type Pos, type vimState } from "@replit/codemirror-vim";
import { markdownConstructs } from "./markdownModel";

let configured = false;

function moveByLogicalLines(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState, inputState: InputStateInterface): Pos {
  if (vim.lastMotion !== moveByLogicalLines && vim.lastHPos !== Infinity) vim.lastHPos = head.ch;
  const repeat = Math.max(0, motionArgs.repeat + (motionArgs.repeatOffset ?? 0));
  const direction = motionArgs.forward ? 1 : -1;
  const line = Math.max(cm.firstLine(), Math.min(cm.lastLine(), head.line + direction * repeat));
  const text = cm.getLine(line);
  const lineEnd = Math.max(0, text.length - 1);
  const ch = vim.lastHPos === Infinity ? lineEnd : Math.min(vim.lastHPos, lineEnd);
  const target = new CodeMirror.Pos(line, ch);
  if (line === head.line || vim.visualMode || Boolean(inputState.operator)) return target;
  const view = cm.cm6;
  const source = view.state.doc.toString();
  const currentIndex = cm.indexFromPos(head);
  const targetIndex = cm.indexFromPos(target);
  const block = markdownConstructs(source, syntaxTree(view.state)).find((construct) =>
    (construct.kind === "table" || construct.kind === "codeBlock")
    && targetIndex >= construct.from
    && targetIndex <= construct.to
    && !(currentIndex > construct.from && currentIndex < construct.to));
  if (!block || block.editPos === undefined) return target;

  const selector = `[data-md-edit-pos="${block.editPos}"]`;
  const editSelector = block.kind === "codeBlock" ? "[data-md-code-edit]" : ".md-block-action";
  if (!view.dom.querySelector<HTMLElement>(selector)?.querySelector(editSelector)) return target;
  const resumePosition = direction > 0 && source[block.to] === "\n" ? block.to + 1 : block.to;
  const resumeBase = direction > 0
    ? block.kind === "codeBlock" ? block.editTo! : block.editPos + (block.text?.length ?? block.to - block.from)
    : block.editPos;
  queueMicrotask(() => {
    const root = view.dom.querySelector<HTMLElement>(selector);
    if (!root) return;
    root.dataset.mdVimResumeAnchor = direction > 0 ? "end" : "start";
    root.dataset.mdVimResumeOffset = String((direction > 0 ? resumePosition : block.from) - resumeBase);
    root.querySelector<HTMLButtonElement>(editSelector)?.click();
  });
  return cm.posFromIndex(block.from);
}

export function configureLogicalLineMotions(): void {
  if (configured) return;
  Vim.defineMotion("markdownThingLogicalLine", moveByLogicalLines);
  Vim.mapCommand("j", "motion", "markdownThingLogicalLine", { forward: true, linewise: true }, {});
  Vim.mapCommand("k", "motion", "markdownThingLogicalLine", { forward: false, linewise: true }, {});
  configured = true;
}
