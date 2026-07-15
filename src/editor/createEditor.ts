import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Prec, StateEffect } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { livePreview, setPreviewContext } from "./livePreview";
import { darkEditorTheme, lightEditorTheme } from "../theme/editorThemes";
import type { ResolvedTheme } from "../theme/themeController";
import { prepareDocument, serializeDocument } from "./lineEndings";

export interface EditorActions {
  save(): void;
  settings(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  initialDocument: string;
  theme: ResolvedTheme;
  actions: EditorActions;
  onChange(text: string): void;
  onCursor(line: number, column: number): void;
}

export interface MarkdownEditor {
  view: EditorView;
  text(): string;
  replace(text: string): void;
  setContext(path: string | null, theme: ResolvedTheme): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(options: EditorOptions): MarkdownEditor {
  const themeCompartment = new Compartment();
  const lineSeparatorCompartment = new Compartment();
  const initialDocument = prepareDocument(options.initialDocument);
  const shortcuts = Prec.highest(keymap.of([
    { key: "Ctrl-s", preventDefault: true, run: () => { options.actions.save(); return true; } },
    { key: "Ctrl-,", preventDefault: true, run: () => { options.actions.settings(); return true; } },
  ]));
  const state = EditorState.create({
    doc: initialDocument.text,
    extensions: [
      lineSeparatorCompartment.of(EditorState.lineSeparator.of(initialDocument.lineSeparator)),
      vim(),
      basicSetup,
      markdown(),
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
      const effects: StateEffect<unknown>[] = [setPreviewContext.of({ documentPath: path, theme })];
      if (theme !== currentTheme) effects.push(themeCompartment.reconfigure(theme === "dark" ? darkEditorTheme : lightEditorTheme));
      currentTheme = theme;
      view.dispatch({ effects });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
