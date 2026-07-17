import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { getEmberTextPalette, type EmberPalette } from "./emberPalette";

const common = {
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "1.72", padding: "48px max(28px, calc((100% - 860px) / 2)) 40vh" },
  ".cm-content": { caretColor: "var(--accent)", maxWidth: "860px", width: "auto", minWidth: "0", flex: "1 1 860px", margin: "0 auto" },
  ".cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none", fontFamily: "var(--font-mono)", fontSize: "11px" },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-raised)", color: "var(--text)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--selection) !important" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-matchingBracket": { color: "var(--accent)", outline: "1px solid var(--border-strong)" },
};

function emberHighlightStyle(palette: EmberPalette): HighlightStyle {
  return HighlightStyle.define([
    { tag: tags.comment, color: palette.base7, fontStyle: "italic" },
    { tag: tags.docComment, color: palette.base7, fontStyle: "italic" },
    { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword, tags.self, tags.null], color: palette.coral, fontWeight: "700" },
    { tag: [tags.bool, tags.atom, tags.constant(tags.name), tags.number], color: palette.orange },
    { tag: [tags.string, tags.character], color: palette.olive },
    { tag: [tags.escape, tags.regexp, tags.special(tags.string)], color: palette.orange, fontWeight: "700" },
    { tag: [tags.typeName, tags.className], color: palette.gold, fontWeight: "700" },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: palette.gold },
    { tag: [tags.propertyName, tags.variableName, tags.namespace], color: palette.fgAlt },
    { tag: [tags.tagName, tags.labelName, tags.macroName], color: palette.coral },
    { tag: tags.attributeName, color: palette.gold },
    { tag: [tags.operator, tags.punctuation, tags.bracket], color: palette.base7 },
    { tag: [tags.url, tags.link], color: palette.steel, textDecoration: "underline" },
    { tag: tags.heading1, color: palette.coral, fontWeight: "700" },
    { tag: tags.heading2, color: palette.orange, fontWeight: "700" },
    { tag: tags.heading3, color: palette.gold, fontWeight: "700" },
    { tag: tags.heading4, color: palette.olive, fontWeight: "700" },
    { tag: tags.heading5, color: palette.steel, fontWeight: "700" },
    { tag: tags.heading6, color: palette.base7, fontWeight: "700" },
    { tag: tags.quote, color: palette.fgAlt, fontStyle: "italic" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.monospace, color: palette.orange },
    { tag: tags.inserted, color: palette.olive },
    { tag: tags.deleted, color: palette.rose },
    { tag: tags.changed, color: palette.gold },
    { tag: tags.meta, color: palette.steel },
    { tag: tags.invalid, color: palette.rose, textDecoration: "underline wavy" },
  ]);
}

function createEditorTheme(theme: "light" | "dark") {
  return [
    EditorView.theme(common, { dark: theme === "dark" }),
    syntaxHighlighting(emberHighlightStyle(getEmberTextPalette(theme)), { fallback: true }),
  ];
}

export const lightEditorTheme = createEditorTheme("light");
export const darkEditorTheme = createEditorTheme("dark");
