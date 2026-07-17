import { WidgetType } from "@codemirror/view";
import { getEmberPalette } from "../../theme/emberPalette";
import { loadMermaid } from "../mermaidLoader";

let renderSequence = 0;

export function emberMermaidConfig(theme: "light" | "dark") {
  const palette = getEmberPalette(theme);
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: "base" as const,
    themeVariables: {
      darkMode: theme === "dark",
      background: palette.bg,
      primaryColor: palette.base2,
      primaryTextColor: palette.fg,
      primaryBorderColor: palette.base7,
      secondaryColor: palette.bgAlt,
      secondaryTextColor: palette.fg,
      secondaryBorderColor: palette.base7,
      tertiaryColor: palette.base3,
      tertiaryTextColor: palette.fg,
      tertiaryBorderColor: palette.base7,
      lineColor: palette.fgAlt,
      textColor: palette.fg,
      mainBkg: palette.base2,
      secondBkg: palette.bgAlt,
      border1: palette.base7,
      border2: palette.base7,
      noteBkgColor: palette.base2,
      noteTextColor: palette.fg,
      noteBorderColor: palette.gold,
      clusterBkg: palette.base0,
      clusterBorder: palette.base7,
      actorBkg: palette.base2,
      actorBorder: palette.coral,
      actorTextColor: palette.fg,
      signalColor: palette.fgAlt,
      signalTextColor: palette.fg,
      labelBoxBkgColor: palette.base2,
      labelBoxBorderColor: palette.base7,
      labelTextColor: palette.fg,
      loopTextColor: palette.fg,
      activationBkgColor: palette.base3,
      activationBorderColor: palette.coral,
      sequenceNumberColor: palette.bg,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    },
  };
}

export class MermaidWidget extends WidgetType {
  constructor(readonly source: string, readonly theme: "light" | "dark") { super(); }

  eq(other: MermaidWidget): boolean {
    return this.source === other.source && this.theme === other.theme;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("figure");
    container.className = "md-mermaid";
    container.setAttribute("aria-label", "Mermaid diagram");
    container.textContent = "Rendering diagram…";
    const token = ++renderSequence;
    void loadMermaid().then(async (mermaid) => {
      mermaid.initialize(emberMermaidConfig(this.theme));
      const result = await mermaid.render(`markdown-thing-${token}`, this.source);
      if (container.isConnected) container.innerHTML = result.svg;
    }).catch((error: unknown) => {
      if (!container.isConnected) return;
      container.classList.add("md-widget-error");
      container.textContent = `Diagram error: ${error instanceof Error ? error.message : "invalid Mermaid syntax"}`;
    });
    return container;
  }

  ignoreEvent(): boolean { return false; }
}
