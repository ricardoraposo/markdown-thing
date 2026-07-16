import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  loadFontSize,
  normalizeFontSize,
  saveFontSize,
} from "../src/editor/fontSizePreference";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe("font-size preference", () => {
  it("defaults to the standard editor size", () => {
    expect(loadFontSize()).toBe(DEFAULT_FONT_SIZE);
  });

  it("rounds and clamps values to the supported range", () => {
    expect(normalizeFontSize(17.6)).toBe(18);
    expect(normalizeFontSize(MIN_FONT_SIZE - 10)).toBe(MIN_FONT_SIZE);
    expect(normalizeFontSize(MAX_FONT_SIZE + 10)).toBe(MAX_FONT_SIZE);
    expect(normalizeFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
  });

  it("persists normalized values and handles invalid storage", () => {
    saveFontSize(19.4);
    expect(loadFontSize()).toBe(19);
    values.set("markdown-thing-font-size", "invalid");
    expect(loadFontSize()).toBe(DEFAULT_FONT_SIZE);
  });
});
