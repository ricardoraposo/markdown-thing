import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { prepareDocument, serializeDocument } from "../src/editor/lineEndings";

function roundTrip(source: string): string {
  const prepared = prepareDocument(source);
  const state = EditorState.create({
    doc: prepared.text,
    extensions: [EditorState.lineSeparator.of(prepared.lineSeparator)],
  });
  return serializeDocument(state);
}

describe("line ending preservation", () => {
  it("round-trips uniform CRLF and bare CR documents", () => {
    expect(roundTrip("one\r\ntwo\r\n")).toBe("one\r\ntwo\r\n");
    expect(roundTrip("one\rtwo\r")).toBe("one\rtwo\r");
  });

  it("normalizes mixed line endings to LF without a second source model", () => {
    const prepared = prepareDocument("one\r\ntwo\nthree\r");
    expect(prepared.mixedLineEndings).toBe(true);
    const state = EditorState.create({
      doc: prepared.text,
      extensions: [EditorState.lineSeparator.of(prepared.lineSeparator)],
    });
    expect(serializeDocument(state)).toBe("one\ntwo\nthree\n");
  });
});
