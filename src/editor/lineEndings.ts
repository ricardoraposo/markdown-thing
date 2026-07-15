import { EditorState, Text } from "@codemirror/state";

export interface PreparedDocument {
  text: Text;
  lineSeparator: string;
  mixedLineEndings: boolean;
}

/**
 * Prepare source for CodeMirror without normalizing uniform CRLF or CR files.
 * Mixed line endings are deliberately normalized to LF so the editor can treat
 * every line break consistently without maintaining a second document model.
 */
export function prepareDocument(source: string): PreparedDocument {
  const endings = source.match(/\r\n|\r|\n/g) ?? [];
  const kinds = new Set(endings);
  const mixedLineEndings = kinds.size > 1;
  const lineSeparator = mixedLineEndings ? "\n" : endings[0] ?? "\n";
  const lines = mixedLineEndings ? source.split(/\r\n|\r|\n/) : source.split(lineSeparator);
  return { text: Text.of(lines), lineSeparator, mixedLineEndings };
}

export function serializeDocument(state: EditorState): string {
  return state.sliceDoc(0, state.doc.length);
}
