import { invoke } from "@tauri-apps/api/core";

export interface OpenedDocument {
  path: string;
  content: string;
}

export interface SavedDocument {
  path: string;
}

export interface FileAdapter {
  open(): Promise<OpenedDocument | null>;
  save(path: string, content: string): Promise<SavedDocument>;
  saveAs(content: string, suggestedName?: string): Promise<SavedDocument | null>;
}

export const tauriFiles: FileAdapter = {
  open: () => invoke<OpenedDocument | null>("open_markdown"),
  save: (path, content) => invoke<SavedDocument>("save_markdown", { path, content }),
  saveAs: (content, suggestedName) => invoke<SavedDocument | null>("save_markdown_as", { content, suggestedName }),
};

export async function loadLocalImage(documentPath: string, target: string): Promise<string> {
  return invoke<string>("load_local_image", { documentPath, target });
}
