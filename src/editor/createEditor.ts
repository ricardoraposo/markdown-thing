import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Table, TaskList } from "@lezer/markdown";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Prec, StateEffect } from "@codemirror/state";
import { drawSelection, dropCursor, highlightSpecialChars, keymap, lineNumbers, EditorView } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { livePreview, setPreviewContext } from "./livePreview";
import { darkEditorTheme, lightEditorTheme } from "../theme/editorThemes";
import type { ResolvedTheme } from "../theme/themeController";
import { prepareDocument, serializeDocument } from "./lineEndings";
import { configureClipboardYanks } from "./vimClipboard";
import { taskLeaderBinding } from "./vimTaskMapping";
import { configureLogicalLineMotions } from "./vimLogicalLines";

export interface EditorActions {
  save(): void;
  settings(): void;
  nextTab(): void;
  previousTab(): void;
  selectTab(index: number): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  initialDocument: string;
  theme: ResolvedTheme;
  leader: string;
  lineNumbers: boolean;
  actions: EditorActions;
  onChange(text: string): void;
  onCursor(line: number, column: number): void;
}

export interface MarkdownEditor {
  view: EditorView;
  text(): string;
  replace(text: string): void;
  setContext(path: string | null, theme: ResolvedTheme): void;
  setLeader(leader: string): void;
  setLineNumbers(enabled: boolean): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(options: EditorOptions): MarkdownEditor {
  configureLogicalLineMotions();
  configureClipboardYanks();
  const themeCompartment = new Compartment();
  const lineSeparatorCompartment = new Compartment();
  const leaderCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const initialDocument = prepareDocument(options.initialDocument);
  const shortcuts = Prec.highest(keymap.of([
    { key: "Ctrl-s", preventDefault: true, run: () => { options.actions.save(); return true; } },
    { key: "Ctrl-,", preventDefault: true, run: () => { options.actions.settings(); return true; } },
    { key: "Alt-j", preventDefault: true, run: () => { options.actions.previousTab(); return true; } },
    { key: "Alt-k", preventDefault: true, run: () => { options.actions.nextTab(); return true; } },
    ...Array.from({ length: 9 }, (_, index) => ({
      key: `Alt-${index + 1}`,
      preventDefault: true,
      run: () => { options.actions.selectTab(index); return true; },
    })),
  ]));
  const state = EditorState.create({
    doc: initialDocument.text,
    extensions: [
      lineSeparatorCompartment.of(EditorState.lineSeparator.of(initialDocument.lineSeparator)),
      vim(),
      leaderCompartment.of(taskLeaderBinding(options.leader)),
      lineNumbersCompartment.of(options.lineNumbers ? lineNumbers() : []),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ extensions: [TaskList, Table] }),
      EditorView.lineWrapping,
      shortcuts,
      livePreview,
      themeCompartment.of(options.theme === "dark" ? darkEditorTheme : lightEditorTheme),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(serializeDocument(update.state));
        if (update.selectionSet || update.docChanged) {
          const position = update.state.selection.main.head;
          const line = update.state.doc.lineAt(position);
          options.onCursor(line.number, position - line.from + 1);
        }
      }),
    ],
  });
  const view = new EditorView({ state, parent: options.parent });
  let currentTheme = options.theme;
  let currentPath: string | null | undefined;

  return {
    view,
    text: () => serializeDocument(view.state),
    replace(text) {
      const prepared = prepareDocument(text);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: prepared.text },
        selection: { anchor: 0 },
        effects: lineSeparatorCompartment.reconfigure(EditorState.lineSeparator.of(prepared.lineSeparator)),
      });
    },
    setContext(path, theme) {
      if (path === currentPath && theme === currentTheme) return;
      const effects: StateEffect<unknown>[] = [setPreviewContext.of({ documentPath: path, theme })];
      if (theme !== currentTheme) effects.push(themeCompartment.reconfigure(theme === "dark" ? darkEditorTheme : lightEditorTheme));
      currentPath = path;
      currentTheme = theme;
      view.dispatch({ effects });
    },
    setLeader(leader) {
      view.dispatch({ effects: leaderCompartment.reconfigure(taskLeaderBinding(leader)) });
    },
    setLineNumbers(enabled) {
      view.dispatch({ effects: lineNumbersCompartment.reconfigure(enabled ? lineNumbers() : []) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
