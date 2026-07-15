import type { FileAdapter, OpenedDocument } from "./tauriFiles";

export interface DocumentTabState {
  id: number;
  path: string | null;
  name: string;
  dirty: boolean;
  active: boolean;
}

export interface DocumentState {
  path: string | null;
  name: string;
  dirty: boolean;
  tabs: DocumentTabState[];
}

export interface DocumentControllerOptions {
  files: FileAdapter;
  getText(): string;
  setText(text: string): void;
  onState(state: DocumentState): void;
  onError(message: string): void;
}

interface DocumentTab {
  id: number;
  path: string | null;
  name: string;
  text: string;
  savedText: string;
}

function nameFromPath(path: string | null): string {
  return path ? path.split(/[\\/]/).pop() || "Untitled.md" : "Untitled.md";
}

export class DocumentController {
  private readonly tabs: DocumentTab[];
  private activeId = 1;
  private nextId = 2;

  constructor(private readonly options: DocumentControllerOptions) {
    const text = options.getText();
    this.tabs = [{ id: 1, path: null, name: "Untitled.md", text, savedText: text }];
    this.emit();
  }

  get state(): DocumentState {
    this.captureActiveText();
    const active = this.activeTab();
    return {
      path: active.path,
      name: active.name,
      dirty: active.text !== active.savedText,
      tabs: this.tabs.map((tab) => ({
        id: tab.id,
        path: tab.path,
        name: tab.name,
        dirty: tab.text !== tab.savedText,
        active: tab.id === this.activeId,
      })),
    };
  }

  changed(): void {
    this.captureActiveText();
    this.emit();
  }

  async openInitial(): Promise<void> {
    try {
      const opened = await this.options.files.initial();
      if (opened) this.openDocument(opened);
    } catch (error) {
      this.fail(error);
    }
  }

  openDocument(opened: OpenedDocument): void {
    this.captureActiveText();
    const existing = this.tabs.find((tab) => tab.path === opened.path);
    if (existing) {
      this.activeId = existing.id;
      this.options.setText(existing.text);
      this.emit();
      return;
    }

    const placeholder = this.tabs.length === 1 && this.tabs[0]?.path === null && this.tabs[0].text === this.tabs[0].savedText;
    const tab: DocumentTab = {
      id: placeholder ? this.tabs[0]!.id : this.nextId++,
      path: opened.path,
      name: nameFromPath(opened.path),
      text: opened.content,
      savedText: opened.content,
    };
    if (placeholder) this.tabs[0] = tab;
    else this.tabs.push(tab);
    this.activeId = tab.id;
    this.options.setText(tab.text);
    this.emit();
  }

  switchTo(tabId: number): void {
    if (tabId === this.activeId) return;
    const target = this.tabs.find((tab) => tab.id === tabId);
    if (!target) return;
    this.captureActiveText();
    this.activeId = target.id;
    this.options.setText(target.text);
    this.emit();
  }

  async save(): Promise<void> {
    this.captureActiveText();
    const tab = this.activeTab();
    if (!tab.path) {
      this.fail("Open a file from the terminal before saving");
      return;
    }
    const tabId = tab.id;
    const path = tab.path;
    const content = tab.text;
    try {
      await this.options.files.save(path, content);
      const savedTab = this.tabs.find((candidate) => candidate.id === tabId && candidate.path === path);
      if (!savedTab) return;
      savedTab.savedText = content;
      this.emit();
    } catch (error) {
      this.fail(error);
    }
  }

  private activeTab(): DocumentTab {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? this.tabs[0]!;
  }

  private captureActiveText(): void {
    this.activeTab().text = this.options.getText();
  }

  private emit(): void {
    this.options.onState(this.state);
  }

  private fail(error: unknown): void {
    this.options.onError(error instanceof Error ? error.message : String(error));
  }
}
