import { redo, undo } from "@codemirror/commands";
import { WidgetType, type EditorView } from "@codemirror/view";
import { toggleTask } from "../taskToggle";
import type { TableCellPreview, TableInlinePart, TablePreview } from "../markdownModel";
import { createEmbeddedCodeEditor, type EmbeddedCodeEditorHandle } from "./EmbeddedCodeEditor";

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

function replaceWithMinimalChange(view: EditorView, from: number, current: string, next: string, suffix = "", userEvent = "input.type"): void {
  if (current === next) return;
  let prefix = 0;
  while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix]) prefix++;
  let currentEnd = current.length;
  let nextEnd = next.length;
  while (currentEnd > prefix && nextEnd > prefix && current[currentEnd - 1] === next[nextEnd - 1]) {
    currentEnd--;
    nextEnd--;
  }
  view.dispatch({
    changes: { from: from + prefix, to: from + currentEnd, insert: next.slice(prefix, nextEnd) + suffix },
    userEvent,
  });
}

function inputUserEvent(event: Event): string {
  return event instanceof InputEvent && event.inputType === "insertFromPaste" ? "input.paste" : "input.type";
}

function restoreVimResumePosition(element: HTMLElement, view: EditorView, startBase: number, endBase: number): void {
  const value = element.dataset.mdVimResumeOffset;
  if (value === undefined) return;
  const anchor = element.dataset.mdVimResumeAnchor;
  delete element.dataset.mdVimResumeOffset;
  delete element.dataset.mdVimResumeAnchor;
  const offset = Number(value);
  const position = (anchor === "end" ? endBase : startBase) + offset;
  if (Number.isInteger(position)) view.dispatch({ selection: { anchor: Math.max(0, Math.min(position, view.state.doc.length)) } });
}

interface TableController {
  widget: TableWidget;
  view: EditorView;
  editing?: {
    header: boolean;
    row: number;
    column: number;
    input: HTMLInputElement;
    composing: boolean;
  };
}

const tableControllers = new WeakMap<HTMLElement, TableController>();

function tableCell(widget: TableWidget, header: boolean, row: number, column: number): TableCellPreview | undefined {
  return (header ? widget.table.header : widget.table.rows[row])?.[column];
}

function renderTableCell(element: HTMLTableCellElement, cell: TableCellPreview): void {
  element.classList.remove("editing");
  element.replaceChildren(...cell.parts.map(renderTablePart));
}

function finishTableCell(wrapper: HTMLElement, focusEditor = false, restoreCellFocus = false): void {
  const controller = tableControllers.get(wrapper);
  const editing = controller?.editing;
  if (!controller || !editing) return;
  const cell = tableCell(controller.widget, editing.header, editing.row, editing.column);
  const element = editing.input.closest<HTMLTableCellElement>("th, td");
  restoreVimResumePosition(wrapper, controller.view, controller.widget.editPos, controller.widget.editPos + controller.widget.source.length);
  controller.editing = undefined;
  if (cell && element) {
    renderTableCell(element, cell);
    if (restoreCellFocus) element.focus();
  }
  if (focusEditor) controller.view.focus();
}

function startTableCell(wrapper: HTMLElement, header: boolean, row: number, column: number): void {
  const controller = tableControllers.get(wrapper);
  if (!controller) return;
  if (controller.editing) finishTableCell(wrapper);
  const cell = tableCell(controller.widget, header, row, column);
  const selector = `[data-md-header="${String(header)}"][data-md-row="${row}"][data-md-column="${column}"]`;
  const element = wrapper.querySelector<HTMLTableCellElement>(selector);
  if (!cell || !element) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "md-table-cell-input";
  input.value = cell.source;
  input.setAttribute("aria-label", `${header ? "Header" : `Row ${row + 1}`} column ${column + 1} Markdown`);
  controller.editing = { header, row, column, input, composing: false };
  element.classList.add("editing");
  element.replaceChildren(input);

  input.addEventListener("compositionstart", () => {
    const current = tableControllers.get(wrapper)?.editing;
    if (current?.input === input) current.composing = true;
  });
  input.addEventListener("compositionend", () => {
    const current = tableControllers.get(wrapper)?.editing;
    if (current?.input === input) current.composing = false;
  });
  input.addEventListener("input", (event) => {
    const current = tableControllers.get(wrapper);
    const metadata = current && tableCell(current.widget, header, row, column);
    if (!current || !metadata) return;
    replaceWithMinimalChange(current.view, metadata.from, metadata.source, input.value, "", inputUserEvent(event));
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      finishTableCell(wrapper, event.key === "Escape", event.key === "Enter");
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      (event.shiftKey ? redo : undo)(controller.view);
    } else if (event.ctrlKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      redo(controller.view);
    }
  });
  input.addEventListener("blur", () => {
    queueMicrotask(() => {
      if (!wrapper.contains(document.activeElement)) finishTableCell(wrapper);
    });
  });
  input.focus();
  input.select();
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string, readonly table: TablePreview, readonly editPos: number) {
    super();
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source && this.editPos === other.editPos;
  }

  private addCells(rowElement: HTMLTableRowElement, cells: TableCellPreview[], header: boolean, row: number): void {
    cells.forEach((cell, column) => {
      const element = document.createElement(header ? "th" : "td");
      if (header) element.setAttribute("scope", "col");
      const alignment = this.table.alignments[column];
      if (alignment) element.style.textAlign = alignment;
      element.tabIndex = 0;
      element.dataset.mdHeader = String(header);
      element.dataset.mdRow = String(row);
      element.dataset.mdColumn = String(column);
      element.setAttribute("aria-label", `${header ? "Header" : `Row ${row + 1}`} column ${column + 1}; press Enter to edit Markdown`);
      element.append(...cell.parts.map(renderTablePart));
      rowElement.append(element);
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "md-table-wrap";
    wrapper.dataset.mdEditPos = String(this.editPos);
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Markdown table; scroll horizontally when needed");
    tableControllers.set(wrapper, { widget: this, view });

    const actions = document.createElement("div");
    actions.className = "md-block-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "md-block-action";
    edit.textContent = "Edit cells";
    edit.setAttribute("aria-label", "Edit Markdown table cells");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      startTableCell(wrapper, true, 0, 0);
    });
    actions.append(edit);

    const table = document.createElement("table");
    const head = table.createTHead();
    this.addCells(head.insertRow(), this.table.header, true, 0);
    const body = table.createTBody();
    this.table.rows.forEach((cells, row) => this.addCells(body.insertRow(), cells, false, row));
    table.setAttribute("aria-label", "Markdown table");
    table.addEventListener("click", (event) => {
      const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("th[data-md-column], td[data-md-column]") : null;
      if (cell && !(event.target instanceof HTMLInputElement)) {
        startTableCell(wrapper, cell.dataset.mdHeader === "true", Number(cell.dataset.mdRow), Number(cell.dataset.mdColumn));
      }
    });
    table.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement || (event.key !== "Enter" && event.key !== "F2")) return;
      const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("th[data-md-column], td[data-md-column]") : null;
      if (!cell) return;
      event.preventDefault();
      startTableCell(wrapper, cell.dataset.mdHeader === "true", Number(cell.dataset.mdRow), Number(cell.dataset.mdColumn));
    });
    wrapper.append(actions, table);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const controller = tableControllers.get(dom);
    if (!controller?.editing) return false;
    const { editing } = controller;
    const cell = tableCell(this, editing.header, editing.row, editing.column);
    if (!cell) return false;
    controller.widget = this;
    controller.view = view;
    dom.dataset.mdEditPos = String(this.editPos);
    if (!editing.composing && editing.input.value !== cell.source) {
      const start = editing.input.selectionStart ?? 0;
      const end = editing.input.selectionEnd ?? start;
      editing.input.value = cell.source;
      editing.input.setSelectionRange(Math.min(start, cell.source.length), Math.min(end, cell.source.length));
    }
    return true;
  }
}

interface CodeController {
  widget: CodeBlockWidget;
  view: EditorView;
  editing: boolean;
  embedded?: EmbeddedCodeEditorHandle;
  generation: number;
}

const codeControllers = new WeakMap<HTMLElement, CodeController>();

function codeEditButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>("[data-md-code-edit]");
}

function renderHighlightedCode(container: HTMLElement): void {
  const controller = codeControllers.get(container);
  if (!controller || controller.editing) return;
  const { widget } = controller;
  const generation = ++controller.generation;
  const pre = document.createElement("pre");
  pre.tabIndex = 0;
  pre.setAttribute("role", "region");
  pre.setAttribute("aria-label", widget.language ? `${widget.language} code; scroll horizontally when needed` : "Code; scroll horizontally when needed");
  const code = document.createElement("code");
  code.textContent = widget.source;
  pre.append(code);
  container.querySelector("pre, .md-code-editor")?.replaceWith(pre);

  if (!widget.language) return;
  container.setAttribute("aria-busy", "true");
  void import("../shikiHighlighter").then(({ highlightCode }) => highlightCode(widget.source, widget.language, widget.theme)).then((highlighted) => {
    const current = codeControllers.get(container);
    if (!current || current.editing || current.generation !== generation || current.widget.source !== widget.source || !container.isConnected) return;
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
    const current = codeControllers.get(container);
    if (current?.generation === generation && container.isConnected) container.setAttribute("aria-busy", "false");
  });
}

function finishCodeEditing(container: HTMLElement, focusEditor = false): void {
  const controller = codeControllers.get(container);
  if (!controller?.editing) return;
  restoreVimResumePosition(container, controller.view, controller.widget.editPos, controller.widget.editTo);
  controller.editing = false;
  controller.embedded?.destroy();
  controller.embedded = undefined;
  controller.generation++;
  container.classList.remove("editing", "highlighted");
  codeEditButton(container)!.textContent = "Edit";
  renderHighlightedCode(container);
  if (focusEditor) controller.view.focus();
}

function startCodeEditing(container: HTMLElement): void {
  const controller = codeControllers.get(container);
  if (!controller || controller.editing) return;
  controller.editing = true;
  controller.generation++;
  container.classList.add("editing");
  container.classList.remove("highlighted");
  container.setAttribute("aria-busy", "false");
  codeEditButton(container)!.textContent = "Done";

  const preview = container.querySelector("pre");
  const previewHeight = preview?.getBoundingClientRect().height ?? 0;
  const previewScrollTop = preview?.scrollTop ?? 0;
  const previewScrollLeft = preview?.scrollLeft ?? 0;
  const mount = document.createElement("div");
  mount.className = "md-code-editor";
  if (previewHeight > 0) mount.style.height = `${previewHeight}px`;
  preview?.replaceWith(mount);
  controller.embedded = createEmbeddedCodeEditor({
    mount,
    parentView: controller.view,
    source: controller.widget.source,
    language: controller.widget.language,
    onChange(source, userEvent) {
      const current = codeControllers.get(container);
      if (!current) return;
      const widget = current.widget;
      replaceWithMinimalChange(current.view, widget.editPos, widget.source, source, widget.editSuffix, userEvent);
    },
    onExit: () => finishCodeEditing(container, true),
  });
  mount.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!container.contains(document.activeElement)) finishCodeEditing(container);
    });
  });
  controller.embedded.view.scrollDOM.scrollTop = previewScrollTop;
  controller.embedded.view.scrollDOM.scrollLeft = previewScrollLeft;
  controller.embedded.focus();
}

export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly language: string,
    readonly editPos: number,
    readonly editTo: number,
    readonly editSuffix: string,
    readonly theme: "light" | "dark",
  ) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return this.source === other.source && this.language === other.language && this.editPos === other.editPos && this.editTo === other.editTo && this.editSuffix === other.editSuffix && this.theme === other.theme;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "md-code-block";
    container.dataset.mdEditPos = String(this.editPos);
    codeControllers.set(container, { widget: this, view, editing: false, generation: 0 });
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
      const source = codeControllers.get(container)?.widget.source ?? "";
      void navigator.clipboard?.writeText(source).then(() => {
        copy.textContent = "Copied";
        window.setTimeout(() => { copy.textContent = "Copy"; }, 1200);
      }).catch(() => { copy.textContent = "Copy failed"; });
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "md-block-action";
    edit.dataset.mdCodeEdit = "";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", "Edit code block in place");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      if (codeControllers.get(container)?.editing) finishCodeEditing(container);
      else startCodeEditing(container);
    });
    actions.append(copy, edit);
    toolbar.append(label, actions);
    const placeholder = document.createElement("pre");
    container.append(toolbar, placeholder);
    renderHighlightedCode(container);
    return container;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const controller = codeControllers.get(dom);
    if (!controller?.editing) return false;
    controller.widget = this;
    controller.view = view;
    dom.dataset.mdEditPos = String(this.editPos);
    if (!controller.embedded) return false;
    controller.embedded.sync(this.source, this.language);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const controller = codeControllers.get(dom);
    controller?.embedded?.destroy();
    codeControllers.delete(dom);
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
