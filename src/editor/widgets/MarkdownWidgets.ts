import { WidgetType, type EditorView } from "@codemirror/view";
import { toggleTask } from "../taskToggle";
import type { TableCellPreview, TableInlinePart, TablePreview } from "../markdownModel";

export class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.className = "md-bullet";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
}

export class DividerWidget extends WidgetType {
  toDOM(): HTMLElement {
    const divider = document.createElement("div");
    divider.className = "md-divider";
    divider.setAttribute("role", "separator");
    return divider;
  }
}

function renderTablePart(part: TableInlinePart): Node {
  if (part.kind === "text") return document.createTextNode(part.text);
  const element = document.createElement(part.kind === "strong" ? "strong" : part.kind === "emphasis" ? "em" : part.kind === "code" ? "code" : "span");
  if (part.kind === "link") {
    element.className = "md-table-link";
    if (part.target) element.title = part.target;
  }
  element.textContent = part.text;
  return element;
}

function activateSource(view: EditorView, position: number): void {
  view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
  view.focus();
}

function editButton(view: EditorView, position: number, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-block-action";
  button.textContent = "Edit";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    activateSource(view, position);
  });
  return button;
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string, readonly table: TablePreview, readonly editPos: number) {
    super();
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source && this.editPos === other.editPos;
  }

  private addCells(row: HTMLTableRowElement, cells: TableCellPreview[], header: boolean): void {
    cells.forEach((cell, index) => {
      const element = document.createElement(header ? "th" : "td");
      if (header) element.setAttribute("scope", "col");
      const alignment = this.table.alignments[index];
      if (alignment) element.style.textAlign = alignment;
      element.append(...cell.parts.map(renderTablePart));
      row.append(element);
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "md-table-wrap";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Markdown table; scroll horizontally when needed");
    const actions = document.createElement("div");
    actions.className = "md-block-actions";
    actions.append(editButton(view, this.editPos, "Edit Markdown table source"));
    const table = document.createElement("table");
    const head = table.createTHead();
    const headerRow = head.insertRow();
    this.addCells(headerRow, this.table.header, true);
    const body = table.createTBody();
    for (const cells of this.table.rows) this.addCells(body.insertRow(), cells, false);
    table.setAttribute("aria-label", "Markdown table");
    wrapper.append(actions, table);
    return wrapper;
  }
}

export class CodeBlockWidget extends WidgetType {
  constructor(readonly source: string, readonly language: string, readonly editPos: number, readonly theme: "light" | "dark") {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return this.source === other.source && this.language === other.language && this.editPos === other.editPos && this.theme === other.theme;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "md-code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "md-code-toolbar";
    const label = document.createElement("span");
    label.className = "md-code-language";
    label.textContent = this.language || "Code";
    const actions = document.createElement("span");
    actions.className = "md-block-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "md-block-action";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", "Copy code block");
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      void navigator.clipboard?.writeText(this.source).then(() => {
        copy.textContent = "Copied";
        window.setTimeout(() => { copy.textContent = "Copy"; }, 1200);
      }).catch(() => { copy.textContent = "Copy failed"; });
    });
    actions.append(copy, editButton(view, this.editPos, "Edit code block source"));
    toolbar.append(label, actions);
    const pre = document.createElement("pre");
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
    pre.setAttribute("aria-label", this.language ? `${this.language} code; scroll horizontally when needed` : "Code; scroll horizontally when needed");
    const code = document.createElement("code");
    code.textContent = this.source;
    pre.append(code);
    container.append(toolbar, pre);

    if (this.language) {
      container.setAttribute("aria-busy", "true");
      void import("../shikiHighlighter").then(({ highlightCode }) => highlightCode(this.source, this.language, this.theme)).then((highlighted) => {
        if (!container.isConnected) return;
        if (!highlighted) {
          container.setAttribute("aria-busy", "false");
          return;
        }
        const fragment = document.createDocumentFragment();
        highlighted.lines.forEach((line, lineIndex) => {
          for (const token of line) {
            const span = document.createElement("span");
            span.textContent = token.content;
            if (token.color) span.style.color = token.color;
            if (token.fontStyle && token.fontStyle & 1) span.style.fontStyle = "italic";
            if (token.fontStyle && token.fontStyle & 2) span.style.fontWeight = "700";
            if (token.fontStyle && token.fontStyle & 4) span.style.textDecoration = "underline";
            fragment.append(span);
          }
          if (lineIndex < highlighted.lines.length - 1) fragment.append("\n");
        });
        code.replaceChildren(fragment);
        if (highlighted.foreground) code.style.color = highlighted.foreground;
        if (highlighted.background) pre.style.backgroundColor = highlighted.background;
        container.setAttribute("aria-busy", "false");
        container.classList.add("highlighted");
      }).catch(() => {
        if (container.isConnected) container.setAttribute("aria-busy", "false");
      });
    }
    return container;
  }
}

export class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly togglePos: number) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return this.checked === other.checked && this.togglePos === other.togglePos;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "md-task-checkbox";
    checkbox.setAttribute("role", "checkbox");
    checkbox.setAttribute("aria-checked", String(this.checked));
    checkbox.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTask(view, this.togglePos);
      view.focus();
    });
    return checkbox;
  }
}
