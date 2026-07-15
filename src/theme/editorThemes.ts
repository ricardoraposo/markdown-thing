import { EditorView } from "@codemirror/view";

const common = {
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "1.72", padding: "48px max(28px, calc((100% - 860px) / 2)) 40vh" },
  ".cm-content": { caretColor: "var(--accent)", maxWidth: "860px", width: "auto", minWidth: "0", flex: "1 1 860px", margin: "0 auto" },
  ".cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none", fontFamily: "var(--font-mono)", fontSize: "11px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--selection) !important" },
};

export const lightEditorTheme = EditorView.theme(common, { dark: false });
export const darkEditorTheme = EditorView.theme(common, { dark: true });
