import { describe, expect, it } from "vitest";
import { emberMermaidConfig } from "../src/editor/widgets/MermaidWidget";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("Ember Mermaid theme", () => {
  it("keeps secure rendering settings and applies the dark palette", () => {
    const config = emberMermaidConfig("dark");

    expect(config).toMatchObject({
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "#1c1b19",
        primaryColor: "#252422",
        primaryTextColor: "#d8d0c0",
        actorBorder: "#e08060",
      },
    });
  });

  it("applies the light palette without weakening security", () => {
    const config = emberMermaidConfig("light");

    expect(config.securityLevel).toBe("strict");
    expect(config.htmlLabels).toBe(false);
    expect(config.themeVariables).toMatchObject({
      darkMode: false,
      background: "#e6dac4",
      primaryTextColor: "#282418",
      actorBorder: "#b84c30",
    });
  });

  it("gives diagram boundaries at least 3:1 non-text contrast", () => {
    for (const theme of ["light", "dark"] as const) {
      const variables = emberMermaidConfig(theme).themeVariables;
      const boundaries = [
        [variables.primaryBorderColor, variables.primaryColor],
        [variables.primaryBorderColor, variables.background],
        [variables.secondaryBorderColor, variables.secondaryColor],
        [variables.tertiaryBorderColor, variables.tertiaryColor],
        [variables.clusterBorder, variables.clusterBkg],
        [variables.actorBorder, variables.actorBkg],
      ];
      for (const [border, surface] of boundaries) expect(contrast(border!, surface!)).toBeGreaterThanOrEqual(3);
    }
  });
});
