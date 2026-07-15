import type { FileAdapter } from "./tauriFiles";

export interface DocumentState {
  path: string | null;
  name: string;
  dirty: boolean;
}

export interface DocumentControllerOptions {
  files: FileAdapter;
  getText(): string;
  setText(text: string): void;
  onState(state: DocumentState): void;
  onError(message: string): void;
}

export class DocumentController {
  private path: string | null = null;
  private savedText: string;
  private operationSequence = 0;

  constructor(private readonly options: DocumentControllerOptions) {
    this.savedText = options.getText();
    this.emit();
  }

  get state(): DocumentState {
    return { path: this.path, name: this.path ? this.path.split(/[\\/]/).pop() || "Untitled.md" : "Untitled.md", dirty: this.options.getText() !== this.savedText };
  }

  changed(): void { this.emit(); }

  async openInitial(): Promise<void> {
    try {
      const opened = await this.options.files.initial();
      if (!opened) return;
      this.options.setText(opened.content);
      this.path = opened.path;
      this.savedText = this.options.getText();
      this.emit();
    } catch (error) {
      this.fail(error);
    }
  }

  async save(): Promise<void> {
    if (!this.path) {
      this.fail("Open a file from the terminal before saving");
      return;
    }
    const operation = ++this.operationSequence;
    const path = this.path;
    const content = this.options.getText();
    try {
      await this.options.files.save(path, content);
      if (operation !== this.operationSequence || this.path !== path) return;
      this.savedText = content;
      this.emit();
    } catch (error) {
      if (operation === this.operationSequence) this.fail(error);
    }
  }

  private emit(): void { this.options.onState(this.state); }
  private fail(error: unknown): void { this.options.onError(error instanceof Error ? error.message : String(error)); }
}
