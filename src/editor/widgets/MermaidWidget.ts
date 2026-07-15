import { WidgetType } from "@codemirror/view";
import { loadMermaid } from "../mermaidLoader";

let renderSequence = 0;

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
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, suppressErrorRendering: true, theme: this.theme === "dark" ? "dark" : "default" });
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
