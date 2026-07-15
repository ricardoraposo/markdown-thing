import { EditorView } from "@codemirror/view";

const common = {
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "1.72", padding: "48px max(28px, calc((100% - 860px) / 2)) 40vh" },
  ".cm-content": { caretColor: "var(--accent)", maxWidth: "860px", width: "100%", margin: "0 auto" },
  ".cm-focused": { outline: "none" },
  ".cm-gutters": { display: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--selection) !important" },
};

export const lightEditorTheme = EditorView.theme(common, { dark: false });
export const darkEditorTheme = EditorView.theme(common, { dark: true });
