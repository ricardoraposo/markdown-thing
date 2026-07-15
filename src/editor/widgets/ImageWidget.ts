import { WidgetType } from "@codemirror/view";
import { resolveImage } from "../../file/imageResolver";

export class ImageWidget extends WidgetType {
  constructor(readonly target: string, readonly alt: string, readonly documentPath: string | null) { super(); }

  eq(other: ImageWidget): boolean {
    return this.target === other.target && this.alt === other.alt && this.documentPath === other.documentPath;
  }

  toDOM(): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = "md-image";
    figure.setAttribute("aria-label", this.alt || "Markdown image");
    const pending = document.createElement("span");
    pending.className = "widget-placeholder";
    pending.textContent = this.alt || "Loading image…";
    figure.append(pending);

    void resolveImage(this.target, this.documentPath).then((src) => {
      if (!figure.isConnected) return;
      const image = document.createElement("img");
      image.alt = this.alt;
      image.src = src;
      image.addEventListener("error", () => {
        pending.hidden = false;
        pending.textContent = this.alt ? `Image unavailable: ${this.alt}` : "Image unavailable";
        image.remove();
      }, { once: true });
      figure.replaceChildren(image, pending);
      pending.hidden = true;
    }).catch((error: unknown) => {
      if (figure.isConnected) pending.textContent = error instanceof Error ? error.message : "Image unavailable";
    });
    return figure;
  }

  ignoreEvent(): boolean { return false; }
}
