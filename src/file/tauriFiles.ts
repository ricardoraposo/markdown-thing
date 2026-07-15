import { invoke } from "@tauri-apps/api/core";

export interface OpenedDocument {
  path: string;
  content: string;
}

export interface SavedDocument {
  path: string;
}

export type LaunchItem =
  | { type: "document"; payload: OpenedDocument }
  | { type: "error"; payload: string };

export interface FileAdapter {
  initial(): Promise<OpenedDocument | null>;
  drainLaunchQueue(): Promise<LaunchItem[]>;
  save(path: string, content: string): Promise<SavedDocument>;
}

export const tauriFiles: FileAdapter = {
  initial: () => invoke<OpenedDocument | null>("initial_document"),
  drainLaunchQueue: () => invoke<LaunchItem[]>("drain_launch_queue"),
  save: (path, content) => invoke<SavedDocument>("save_markdown", { path, content }),
};

export async function loadLocalImage(documentPath: string, target: string): Promise<string> {
  return invoke<string>("load_local_image", { documentPath, target });
}
