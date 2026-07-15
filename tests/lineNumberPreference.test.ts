import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLineNumbers, saveLineNumbers } from "../src/editor/lineNumberPreference";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe("line-number preference", () => {
  it("defaults to hidden", () => {
    expect(loadLineNumbers()).toBe(false);
  });

  it("persists both enabled and disabled values", () => {
    saveLineNumbers(true);
    expect(loadLineNumbers()).toBe(true);
    saveLineNumbers(false);
    expect(loadLineNumbers()).toBe(false);
  });
});
