import { syntaxTree } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { blockRangeIsActive, markdownConstructs, rangeIsActive, type TextRange } from "./markdownModel";
import { ImageWidget } from "./widgets/ImageWidget";
import { MermaidWidget } from "./widgets/MermaidWidget";
import { BulletWidget, CodeBlockWidget, DividerWidget, TableWidget, TaskWidget } from "./widgets/MarkdownWidgets";

export interface PreviewContext {
  documentPath: string | null;
  theme: "light" | "dark";
}

export const setPreviewContext = StateEffect.define<PreviewContext>();
const contextField = StateField.define<PreviewContext>({
  create: () => ({ documentPath: null, theme: "dark" }),
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setPreviewContext)) value = effect.value;
    return value;
  },
});

function selections(state: EditorState): TextRange[] {
  return state.selection.ranges.map((range) => ({ from: range.from, to: range.to }));
}

export function buildDecorations(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  const context = state.field(contextField);
  const selected = selections(state);
  const selectedText = selected.filter((selection) => selection.from !== selection.to);
  const ranges: Array<ReturnType<Decoration["range"]>> = [];

  for (const construct of markdownConstructs(source, syntaxTree(state))) {
    const atomicBlock = construct.kind === "table" || construct.kind === "codeBlock";
    const active = construct.kind === "task"
      ? rangeIsActive(construct, selectedText)
      : atomicBlock
        ? blockRangeIsActive(construct, selected)
        : rangeIsActive(construct, selected);
    if (construct.kind === "heading") {
      ranges.push(Decoration.mark({ class: `md-heading md-heading-${construct.level ?? 1}` }).range(construct.from, construct.to));
    } else if (construct.kind === "emphasis" || construct.kind === "strong") {
      ranges.push(Decoration.mark({ class: construct.kind === "emphasis" ? "md-emphasis" : "md-strong" }).range(construct.from, construct.to));
    } else if (construct.kind === "link") {
      ranges.push(Decoration.mark({ class: "md-link", attributes: construct.target ? { title: construct.target } : undefined }).range(construct.from, construct.to));
    } else if (construct.kind === "inlineCode") {
      ranges.push(Decoration.mark({ class: "md-inline-code" }).range(construct.from, construct.to));
    }

    if (active) continue;
    if (construct.kind === "image" && construct.target !== undefined) {
      ranges.push(Decoration.replace({ widget: new ImageWidget(construct.target, construct.text ?? "", context.documentPath) }).range(construct.from, construct.to));
    } else if (construct.kind === "mermaid") {
      ranges.push(Decoration.replace({ block: true, widget: new MermaidWidget(construct.text ?? "", context.theme) }).range(construct.from, construct.to));
    } else if (construct.kind === "bullet") {
      const marker = construct.markers[0];
      if (marker) ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(marker.from, marker.to));
    } else if (construct.kind === "divider") {
      ranges.push(Decoration.replace({ block: true, widget: new DividerWidget() }).range(construct.from, construct.to));
    } else if (construct.kind === "task" && construct.togglePos !== undefined) {
      const marker = construct.markers[0];
      if (marker) ranges.push(Decoration.replace({ widget: new TaskWidget(construct.checked ?? false, construct.togglePos) }).range(marker.from, marker.to));
    } else if (construct.kind === "table" && construct.table && construct.editPos !== undefined) {
      ranges.push(Decoration.replace({ block: true, widget: new TableWidget(construct.text ?? "", construct.table, construct.editPos) }).range(construct.from, construct.to));
    } else if (construct.kind === "codeBlock" && construct.editPos !== undefined && construct.editTo !== undefined) {
      ranges.push(Decoration.replace({ block: true, widget: new CodeBlockWidget(construct.text ?? "", construct.language ?? "", construct.editPos, construct.editTo, construct.editSuffix ?? "", context.theme) }).range(construct.from, construct.to));
    } else {
      for (const marker of construct.markers) {
        if (marker.from < marker.to) ranges.push(Decoration.replace({}).range(marker.from, marker.to));
      }
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to || a.value.startSide - b.value.startSide);
  return Decoration.set(ranges, true);
}

const decorationField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, transaction) {
    const contextChanged = transaction.effects.some((effect) => effect.is(setPreviewContext));
    const parseTreeChanged = syntaxTree(transaction.startState) !== syntaxTree(transaction.state);
    if (transaction.docChanged || transaction.selection || contextChanged || parseTreeChanged) {
      return buildDecorations(transaction.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const livePreview = [contextField, decorationField];
