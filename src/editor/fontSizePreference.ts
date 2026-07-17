const STORAGE_KEY = "markdown-thing-font-size";

export const DEFAULT_FONT_SIZE = 17;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;

export function normalizeFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function loadFontSize(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? DEFAULT_FONT_SIZE : normalizeFontSize(Number(stored));
}

export function saveFontSize(fontSize: number): void {
  localStorage.setItem(STORAGE_KEY, String(normalizeFontSize(fontSize)));
}
