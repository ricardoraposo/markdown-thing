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

export class TableWidget extends WidgetType {
  constructor(readonly source: string, readonly table: TablePreview) {
    super();
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source;
  }

  private addCells(view: EditorView, row: HTMLTableRowElement, cells: TableCellPreview[], header: boolean): void {
    cells.forEach((cell, index) => {
      const element = document.createElement(header ? "th" : "td");
      if (header) element.setAttribute("scope", "col");
      const alignment = this.table.alignments[index];
      if (alignment) element.style.textAlign = alignment;
      element.append(...cell.parts.map(renderTablePart));
      element.addEventListener("click", () => activateSource(view, cell.from));
      row.append(element);
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "md-table-wrap";
    const table = document.createElement("table");
    const head = table.createTHead();
    const headerRow = head.insertRow();
    this.addCells(view, headerRow, this.table.header, true);
    const body = table.createTBody();
    for (const cells of this.table.rows) this.addCells(view, body.insertRow(), cells, false);
    table.setAttribute("aria-label", "Markdown table");
    wrapper.append(table);
    return wrapper;
  }
}

export class CodeBlockWidget extends WidgetType {
  constructor(readonly source: string, readonly language: string, readonly editPos: number) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return this.source === other.source && this.language === other.language && this.editPos === other.editPos;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "md-code-block";
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", this.language ? `${this.language} code block` : "Code block");
    if (this.language) {
      const label = document.createElement("span");
      label.className = "md-code-language";
      label.textContent = this.language;
      container.append(label);
    }
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = this.source;
    pre.append(code);
    container.append(pre);
    container.addEventListener("click", () => activateSource(view, this.editPos));
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
