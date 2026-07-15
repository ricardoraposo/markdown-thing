import { createEditor, type MarkdownEditor } from "./editor/createEditor";
import { DocumentController, type DocumentState } from "./file/documentController";
import { tauriFiles } from "./file/tauriFiles";
import { ThemeController, type ThemePreference } from "./theme/themeController";

const WELCOME = `# Welcome to Markdown Thing

A **Vim-first** Markdown editor where the document is the interface.

Move the cursor away from Markdown syntax to see it render. Move back to reveal the exact source.

- Press \`i\` to enter Insert mode
- Press \`Esc\` to return to Normal mode
- Use **Ctrl+O** to open and **Ctrl+S** to save
- Add a fenced \`mermaid\` block when you need a diagram
`;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="toolbar">
        <div class="window-title"><span class="app-mark">M</span><strong id="filename">Untitled.md</strong><span id="dirty" aria-label="Unsaved changes"></span></div>
        <nav aria-label="File actions">
          <button id="open" type="button" title="Open (Ctrl+O)">Open</button>
          <button id="save" type="button" title="Save (Ctrl+S)">Save</button>
          <button id="save-as" type="button" title="Save As (Ctrl+Shift+S)">Save As</button>
        </nav>
        <label class="theme-control">Theme
          <select id="theme" aria-label="Color theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
        </label>
      </header>
      <section id="editor" aria-label="Markdown editor"></section>
      <footer class="statusbar"><span id="message">Ready</span><span id="position">Ln 1, Col 1</span></footer>
    </main>`;

  const editorHost = root.querySelector<HTMLElement>("#editor")!;
  const filename = root.querySelector<HTMLElement>("#filename")!;
  const dirty = root.querySelector<HTMLElement>("#dirty")!;
  const message = root.querySelector<HTMLElement>("#message")!;
  const position = root.querySelector<HTMLElement>("#position")!;
  const themeSelect = root.querySelector<HTMLSelectElement>("#theme")!;
  const themes = new ThemeController();
  themeSelect.value = themes.value;

  let editor: MarkdownEditor;
  let controller: DocumentController;
  let documentState: DocumentState = { path: null, name: "Untitled.md", dirty: false };
  let messageTimer: number | undefined;
  const showMessage = (text: string, error = false): void => {
    message.textContent = text;
    message.classList.toggle("error", error);
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { message.textContent = "Ready"; message.classList.remove("error"); }, 5000);
  };
  const updateState = (state: DocumentState): void => {
    documentState = state;
    filename.textContent = state.name;
    dirty.textContent = state.dirty ? "●" : "";
    document.title = `${state.dirty ? "• " : ""}${state.name} — Markdown Thing`;
    editor?.setContext(state.path, themes.resolved);
  };

  editor = createEditor({
    parent: editorHost,
    initialDocument: WELCOME,
    theme: themes.resolved,
    actions: {
      save: () => { void controller.save(); },
      settings: () => undefined,
    },
    onChange: () => controller?.changed(),
    onCursor: (line, column) => { position.textContent = `Ln ${line}, Col ${column}`; },
  });
  controller = new DocumentController({
    files: tauriFiles,
    getText: () => editor.text(),
    setText: (text) => editor.replace(text),
    onState: updateState,
    onError: (error) => showMessage(error, true),
  });

  root.querySelector("#save")!.addEventListener("click", () => void controller.save());
  themeSelect.addEventListener("change", () => themes.set(themeSelect.value as ThemePreference));
  themes.subscribe((theme) => editor.setContext(documentState.path, theme));
  void controller.openInitial();
  editor.focus();
}
