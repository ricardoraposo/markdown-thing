export type EmberVariant = "ember" | "ember-soft" | "ember-light";

export interface EmberPalette {
  readonly type: "light" | "dark";
  readonly bg: string;
  readonly bgAlt: string;
  readonly base0: string;
  readonly base1: string;
  readonly base2: string;
  readonly base3: string;
  readonly base4: string;
  readonly base5: string;
  readonly base6: string;
  readonly base7: string;
  readonly base8: string;
  readonly fg: string;
  readonly fgAlt: string;
  readonly coral: string;
  readonly orange: string;
  readonly gold: string;
  readonly olive: string;
  readonly sage: string;
  readonly steel: string;
  readonly rose: string;
  readonly mauve: string;
}

const darkAccents = {
  coral: "#e08060",
  orange: "#c09058",
  gold: "#c8b468",
  olive: "#8a9868",
  sage: "#80a090",
  steel: "#7890a0",
  rose: "#b07878",
  mauve: "#988090",
} as const;

const lightAccents = {
  coral: "#b84c30",
  orange: "#946030",
  gold: "#7a6820",
  olive: "#4a6830",
  sage: "#386858",
  steel: "#3a6080",
  rose: "#905050",
  mauve: "#706070",
} as const;

/** Exact values from ember-theme/nvim's palette.lua. */
export const emberPalettes = {
  ember: {
    type: "dark",
    bg: "#1c1b19",
    bgAlt: "#242320",
    base0: "#151412",
    base1: "#1c1b19",
    base2: "#252422",
    base3: "#2e2d2a",
    base4: "#3e3c38",
    base5: "#585550",
    base6: "#706c61",
    base7: "#908a7e",
    base8: "#b8b0a0",
    fg: "#d8d0c0",
    fgAlt: "#b0a898",
    ...darkAccents,
  },
  "ember-soft": {
    type: "dark",
    bg: "#242320",
    bgAlt: "#2a2927",
    base0: "#1c1b19",
    base1: "#222120",
    base2: "#2c2b28",
    base3: "#353430",
    base4: "#444240",
    base5: "#585550",
    base6: "#706c61",
    base7: "#908a7e",
    base8: "#b8b0a0",
    fg: "#d8d0c0",
    fgAlt: "#b0a898",
    ...darkAccents,
  },
  "ember-light": {
    type: "light",
    bg: "#e6dac4",
    bgAlt: "#ddd0b8",
    base0: "#f0e8d8",
    base1: "#e6dac4",
    base2: "#d8ccb0",
    base3: "#cec2a8",
    base4: "#b8ac96",
    base5: "#989080",
    base6: "#787060",
    base7: "#605848",
    base8: "#484030",
    fg: "#282418",
    fgAlt: "#585040",
    ...lightAccents,
  },
} as const satisfies Record<EmberVariant, EmberPalette>;

export function getEmberPalette(theme: "light" | "dark"): EmberPalette {
  return theme === "dark" ? emberPalettes.ember : emberPalettes["ember-light"];
}

/**
 * Keeps Ember's hues while darkening the light variant's low-contrast accents
 * for small syntax text. These are sRGB blends of each accent toward `fg`.
 */
export function getEmberTextPalette(theme: "light" | "dark"): EmberPalette {
  const palette = getEmberPalette(theme);
  if (theme === "dark") return palette;
  return {
    ...palette,
    coral: "#9b442b",
    orange: "#7e542b",
    gold: "#6e5e1f",
    rose: "#804948",
    mauve: "#655763",
  };
}
