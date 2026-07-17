import { createBundledHighlighter, createSingletonShorthands, type ThemeRegistration } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { getEmberTextPalette, type EmberPalette } from "../theme/emberPalette";

const languages = {
  ruby: () => import("@shikijs/langs/ruby"),
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  bash: () => import("@shikijs/langs/bash"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  markdown: () => import("@shikijs/langs/markdown"),
} as const;

function createEmberTheme(name: "ember" | "ember-light", palette: EmberPalette): ThemeRegistration {
  return {
    name,
    type: palette.type,
    colors: {
      "editor.background": palette.bg,
      "editor.foreground": palette.fg,
      "editor.selectionBackground": palette.base4,
      "editor.lineHighlightBackground": palette.bgAlt,
    },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: palette.base7, fontStyle: "italic" } },
      { scope: ["keyword", "storage", "storage.type", "storage.modifier"], settings: { foreground: palette.coral, fontStyle: "bold" } },
      { scope: ["constant", "constant.numeric", "constant.language"], settings: { foreground: palette.orange } },
      { scope: ["string", "punctuation.definition.string"], settings: { foreground: palette.olive } },
      { scope: ["constant.character.escape", "string.regexp"], settings: { foreground: palette.orange, fontStyle: "bold" } },
      { scope: ["entity.name.function", "support.function"], settings: { foreground: palette.gold } },
      { scope: ["entity.name.type", "entity.name.class", "support.type"], settings: { foreground: palette.gold, fontStyle: "bold" } },
      { scope: ["variable", "variable.other", "meta.object-literal.key"], settings: { foreground: palette.fgAlt } },
      { scope: ["variable.language", "support.variable"], settings: { foreground: palette.coral } },
      { scope: ["entity.name.tag"], settings: { foreground: palette.coral } },
      { scope: ["entity.other.attribute-name"], settings: { foreground: palette.gold } },
      { scope: ["keyword.operator", "punctuation", "meta.brace"], settings: { foreground: palette.base7 } },
      { scope: ["markup.heading.1"], settings: { foreground: palette.coral, fontStyle: "bold" } },
      { scope: ["markup.heading.2"], settings: { foreground: palette.orange, fontStyle: "bold" } },
      { scope: ["markup.heading.3"], settings: { foreground: palette.gold, fontStyle: "bold" } },
      { scope: ["markup.heading.4"], settings: { foreground: palette.olive, fontStyle: "bold" } },
      { scope: ["markup.heading.5"], settings: { foreground: palette.steel, fontStyle: "bold" } },
      { scope: ["markup.heading.6"], settings: { foreground: palette.base7, fontStyle: "bold" } },
      { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
      { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
      { scope: ["markup.inline.raw"], settings: { foreground: palette.orange } },
      { scope: ["markup.underline.link", "string.other.link"], settings: { foreground: palette.steel, fontStyle: "underline" } },
      { scope: ["invalid", "message.error"], settings: { foreground: palette.rose, fontStyle: "underline" } },
    ],
  };
}

const themes = {
  ember: async () => ({ default: createEmberTheme("ember", getEmberTextPalette("dark")) }),
  "ember-light": async () => ({ default: createEmberTheme("ember-light", getEmberTextPalette("light")) }),
} as const;

const aliases: Record<string, keyof typeof languages> = {
  rb: "ruby",
  ruby: "ruby",
  js: "javascript",
  javascript: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  typescript: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  jsonc: "jsonc",
  html: "html",
  htm: "html",
  css: "css",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  go: "go",
  golang: "go",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  shell: "bash",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
};

const createHighlighter = createBundledHighlighter({
  langs: languages,
  themes,
  engine: () => createJavaScriptRegexEngine(),
});
const { codeToTokens } = createSingletonShorthands(createHighlighter);

export interface HighlightToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export interface HighlightedCode {
  lines: HighlightToken[][];
  foreground?: string;
  background?: string;
}

export async function highlightCode(source: string, language: string, theme: "light" | "dark"): Promise<HighlightedCode | null> {
  const normalized = aliases[language.trim().toLowerCase()];
  if (!normalized) return null;
  const result = await codeToTokens(source, {
    lang: normalized,
    theme: theme === "dark" ? "ember" : "ember-light",
    tokenizeMaxLineLength: 2000,
    tokenizeTimeLimit: 100,
  });
  return {
    lines: result.tokens.map((line) => line.map(({ content, color, fontStyle }) => ({
      content,
      ...(color ? { color } : {}),
      ...(fontStyle ? { fontStyle } : {}),
    }))),
    ...(result.fg ? { foreground: result.fg } : {}),
    ...(result.bg ? { background: result.bg } : {}),
  };
}
