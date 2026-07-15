import { defaultKeymap, redo, undo } from "@codemirror/commands";
import { Annotation, EditorState, Prec, Transaction } from "@codemirror/state";
import { drawSelection, EditorView, highlightSpecialChars, keymap } from "@codemirror/view";
import { getCM, vim, type vimState } from "@replit/codemirror-vim";
import { configureLogicalLineMotions } from "../vimLogicalLines";

const parentSync = Annotation.define<boolean>();

function minimalChange(current: string, next: string): { from: number; to: number; insert: string } | null {
  if (current === next) return null;
  let prefix = 0;
  while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix]) prefix++;
  let currentEnd = current.length;
  let nextEnd = next.length;
  while (currentEnd > prefix && nextEnd > prefix && current[currentEnd - 1] === next[nextEnd - 1]) {
    currentEnd--;
    nextEnd--;
  }
  return { from: prefix, to: currentEnd, insert: next.slice(prefix, nextEnd) };
}

export interface EmbeddedCodeEditorOptions {
  mount: HTMLElement;
  parentView: EditorView;
  source: string;
  language: string;
  onChange(source: string, userEvent: string): void;
  onExit(): void;
}

export interface EmbeddedCodeEditorHandle {
  readonly view: EditorView;
  sync(source: string, language: string): void;
  focus(): void;
  destroy(): void;
}

export function createEmbeddedCodeEditor(options: EmbeddedCodeEditorOptions): EmbeddedCodeEditorHandle {
  configureLogicalLineMotions();
  let destroyed = false;
  let language = options.language;
  const exitHandler = Prec.highest(EditorView.domEventHandlers({
    keydown(event, view) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        options.onExit();
        return true;
      }
      const vimState = getCM(view)?.state.vim as vimState | null | undefined;
      const normal = Boolean(vimState && !vimState.insertMode && !vimState.visualMode && !vimState.inputState.operator && !vimState.inputState.keyBuffer.length);
      if (normal && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "u") {
        event.preventDefault();
        undo(options.parentView);
        return true;
      }
      if (normal && event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        redo(options.parentView);
        return true;
      }
      if (event.key !== "Escape" || !normal) return false;
      event.preventDefault();
      options.onExit();
      return true;
    },
  }));
  const parentHistoryKeys = Prec.highest(keymap.of([
    { key: "Mod-z", preventDefault: true, run: () => undo(options.parentView) },
    { key: "Mod-Shift-z", preventDefault: true, run: () => redo(options.parentView) },
    { key: "Mod-y", preventDefault: true, run: () => redo(options.parentView) },
  ]));
  const view = new EditorView({
    parent: options.mount,
    state: EditorState.create({
      doc: options.source,
      extensions: [
        vim({ status: false }),
        exitHandler,
        parentHistoryKeys,
        highlightSpecialChars(),
        drawSelection(),
        EditorState.tabSize.of(2),
        EditorState.allowMultipleSelections.of(true),
        keymap.of(defaultKeymap),
        EditorView.contentAttributes.of({
          "aria-label": `${language || "Code"} block editor`,
          "aria-multiline": "true",
          spellcheck: "false",
          autocapitalize: "off",
          autocomplete: "off",
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || update.transactions.some((transaction) => transaction.annotation(parentSync))) return;
          const userEvent = update.transactions.map((transaction) => transaction.annotation(Transaction.userEvent)).find(Boolean) ?? "input.type";
          options.onChange(update.state.doc.toString(), userEvent);
        }),
      ],
    }),
  });
  return {
    view,
    sync(source, nextLanguage) {
      if (destroyed) return;
      language = nextLanguage;
      view.contentDOM.setAttribute("aria-label", `${language || "Code"} block editor`);
      const change = minimalChange(view.state.doc.toString(), source);
      if (change) view.dispatch({ changes: change, annotations: [parentSync.of(true), Transaction.addToHistory.of(false)] });
    },
    focus() {
      if (destroyed) return;
      view.focus();
      view.dispatch({ selection: { anchor: 0 } });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      view.destroy();
    },
  };
}
