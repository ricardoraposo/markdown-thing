import type { EphemeralAppend, EphemeralDocument, FileAdapter, OpenedDocument } from "./tauriFiles";

export interface DocumentTabState {
  id: number;
  path: string | null;
  name: string;
  ephemeral: boolean;
  dirty: boolean;
  active: boolean;
}

export interface DocumentState {
  path: string | null;
  name: string;
  ephemeral: boolean;
  dirty: boolean;
  tabs: DocumentTabState[];
}

export interface DocumentControllerOptions {
  files: FileAdapter;
  getText(): string;
  setText(text: string): void;
  appendText(text: string): void;
  onState(state: DocumentState): void;
  onError(message: string): void;
}

interface DocumentTab {
  id: number;
  key: string | null;
  path: string | null;
  name: string;
  ephemeral: boolean;
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
  private disposed = false;

  constructor(private readonly options: DocumentControllerOptions) {
    const text = options.getText();
    this.tabs = [{
      id: 1,
      key: null,
      path: null,
      name: "Untitled.md",
      ephemeral: false,
      text,
      savedText: text,
    }];
    this.emit();
  }

  get state(): DocumentState {
    if (!this.disposed) this.captureActiveText();
    return this.snapshot();
  }

  changed(text?: string): void {
    if (this.disposed) return;
    const active = this.activeTab();
    const wasDirty = active.text !== active.savedText;
    active.text = text ?? this.options.getText();
    if (wasDirty !== (active.text !== active.savedText)) this.emit();
  }

  dispose(): void {
    this.disposed = true;
  }

  async openInitial(): Promise<void> {
    try {
      const opened = await this.options.files.initial();
      if (!this.disposed && opened) this.openDocument(opened);
    } catch (error) {
      if (!this.disposed) this.fail(error);
    }
  }

  openDocument(opened: OpenedDocument): void {
    if (this.disposed) return;
    this.captureActiveText();
    const existing = this.tabs.find((tab) => tab.key === `file:${opened.path}`);
    if (existing) {
      this.activeId = existing.id;
      this.options.setText(existing.text);
      this.emit();
      return;
    }

    const placeholder = this.tabs.length === 1 && this.tabs[0]?.path === null && this.tabs[0].text === this.tabs[0].savedText;
    const tab: DocumentTab = {
      id: placeholder ? this.tabs[0]!.id : this.nextId++,
      key: `file:${opened.path}`,
      path: opened.path,
      name: nameFromPath(opened.path),
      ephemeral: false,
      text: opened.content,
      savedText: opened.content,
    };
    if (placeholder) this.tabs[0] = tab;
    else this.tabs.push(tab);
    this.activeId = tab.id;
    this.options.setText(tab.text);
    this.emit();
  }

  openEphemeral(opened: EphemeralDocument): void {
    if (this.disposed) return;
    this.captureActiveText();
    const key = `ephemeral:${opened.id}`;
    const existing = this.tabs.find((tab) => tab.key === key);
    if (existing) {
      this.activeId = existing.id;
      this.options.setText(existing.text);
      this.emit();
      return;
    }

    const placeholder = this.tabs.length === 1 && this.tabs[0]?.key === null && this.tabs[0].text === this.tabs[0].savedText;
    const tab: DocumentTab = {
      id: placeholder ? this.tabs[0]!.id : this.nextId++,
      key,
      path: null,
      name: opened.title,
      ephemeral: true,
      text: opened.content,
      savedText: opened.content,
    };
    if (placeholder) this.tabs[0] = tab;
    else this.tabs.push(tab);
    this.activeId = tab.id;
    this.options.setText(tab.text);
    this.emit();
  }

  appendEphemeral(update: EphemeralAppend): void {
    if (this.disposed || update.content.length === 0) return;
    const tab = this.tabs.find((candidate) => candidate.key === `ephemeral:${update.id}`);
    if (!tab) return;
    if (tab.id === this.activeId) this.captureActiveText();
    tab.text += update.content;
    tab.savedText += update.content;
    if (tab.id === this.activeId) this.options.appendText(update.content);
  }

  switchTo(tabId: number): void {
    if (this.disposed || tabId === this.activeId) return;
    const target = this.tabs.find((tab) => tab.id === tabId);
    if (!target) return;
    this.captureActiveText();
    this.activeId = target.id;
    this.options.setText(target.text);
    this.emit();
  }

  switchRelative(offset: number): void {
    if (this.disposed || this.tabs.length < 2) return;
    const current = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const index = (current + offset + this.tabs.length) % this.tabs.length;
    this.switchTo(this.tabs[index]!.id);
  }

  switchToIndex(index: number): void {
    if (this.disposed) return;
    const tab = this.tabs[index];
    if (tab) this.switchTo(tab.id);
  }

  async save(): Promise<void> {
    if (this.disposed) return;
    this.captureActiveText();
    const tab = this.activeTab();
    if (!tab.path) {
      this.fail(tab.ephemeral
        ? "Agent output is temporary and cannot be saved"
        : "Open a file from the terminal before saving");
      return;
    }
    const tabId = tab.id;
    const path = tab.path;
    const content = tab.text;
    try {
      await this.options.files.save(path, content);
      if (this.disposed) return;
      const savedTab = this.tabs.find((candidate) => candidate.id === tabId && candidate.path === path);
      if (!savedTab) return;
      savedTab.savedText = content;
      this.emit();
    } catch (error) {
      if (!this.disposed) this.fail(error);
    }
  }

  private activeTab(): DocumentTab {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? this.tabs[0]!;
  }

  private captureActiveText(): void {
    this.activeTab().text = this.options.getText();
  }

  private snapshot(): DocumentState {
    const active = this.activeTab();
    return {
      path: active.path,
      name: active.name,
      ephemeral: active.ephemeral,
      dirty: active.text !== active.savedText,
      tabs: this.tabs.map((tab) => ({
        id: tab.id,
        path: tab.path,
        name: tab.name,
        ephemeral: tab.ephemeral,
        dirty: tab.text !== tab.savedText,
        active: tab.id === this.activeId,
      })),
    };
  }

  private emit(): void {
    if (!this.disposed) this.options.onState(this.snapshot());
  }

  private fail(error: unknown): void {
    if (!this.disposed) this.options.onError(error instanceof Error ? error.message : String(error));
  }
}
