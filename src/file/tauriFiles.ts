import { invoke } from "@tauri-apps/api/core";

export interface OpenedDocument {
  path: string;
  content: string;
}

export interface SavedDocument {
  path: string;
}

export interface FileAdapter {
  initial(): Promise<OpenedDocument | null>;
  save(path: string, content: string): Promise<SavedDocument>;
}

export const tauriFiles: FileAdapter = {
  initial: () => invoke<OpenedDocument | null>("initial_document"),
  save: (path, content) => invoke<SavedDocument>("save_markdown", { path, content }),
};

export async function loadLocalImage(documentPath: string, target: string): Promise<string> {
  return invoke<string>("load_local_image", { documentPath, target });
}
