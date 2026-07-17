import { describe, expect, it } from "vitest";
import { emberPalettes, getEmberPalette, getEmberTextPalette } from "../src/theme/emberPalette";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("Ember palette", () => {
  it("keeps the reference backgrounds, foregrounds, and hero accents", () => {
    expect(emberPalettes.ember).toMatchObject({
      type: "dark",
      bg: "#1c1b19",
      bgAlt: "#242320",
      fg: "#d8d0c0",
      fgAlt: "#b0a898",
      coral: "#e08060",
    });
    expect(emberPalettes["ember-soft"]).toMatchObject({
      type: "dark",
      bg: "#242320",
      bgAlt: "#2a2927",
      coral: "#e08060",
    });
    expect(emberPalettes["ember-light"]).toMatchObject({
      type: "light",
      bg: "#e6dac4",
      bgAlt: "#ddd0b8",
      fg: "#282418",
      fgAlt: "#585040",
      coral: "#b84c30",
    });
  });

  it("maps the app's system-resolved modes to Ember variants", () => {
    expect(getEmberPalette("dark")).toBe(emberPalettes.ember);
    expect(getEmberPalette("light")).toBe(emberPalettes["ember-light"]);
  });

  it("keeps small syntax text at WCAG AA contrast", () => {
    for (const theme of ["light", "dark"] as const) {
      const palette = getEmberTextPalette(theme);
      const syntaxColors = [
        palette.coral,
        palette.orange,
        palette.gold,
        palette.olive,
        palette.sage,
        palette.steel,
        palette.rose,
        palette.mauve,
        palette.base7,
        palette.fgAlt,
      ];
      for (const color of syntaxColors) expect(contrast(color, palette.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
