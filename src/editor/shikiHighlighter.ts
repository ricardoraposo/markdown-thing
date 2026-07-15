import { createBundledHighlighter, createSingletonShorthands } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

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

const themes = {
  "github-light": () => import("@shikijs/themes/github-light"),
  "github-dark": () => import("@shikijs/themes/github-dark"),
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
    theme: theme === "dark" ? "github-dark" : "github-light",
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
