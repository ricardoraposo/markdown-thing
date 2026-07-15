import { listen } from "@tauri-apps/api/event";
import { createEditor, type MarkdownEditor } from "./editor/createEditor";
import { describeLeader, loadLeader, normalizeLeader, saveLeader } from "./editor/leaderPreference";
import { loadLineNumbers, saveLineNumbers } from "./editor/lineNumberPreference";
import { DocumentController, type DocumentState } from "./file/documentController";
import { tauriFiles } from "./file/tauriFiles";
import { ThemeController, type ThemePreference } from "./theme/themeController";

const WELCOME = `# Markdown Thing

A **Vim-first** Markdown reader and editor where the document is the interface.

Open a file directly from your terminal:

\`\`\`sh
markdown-thing README.md
\`\`\`

- Press \`i\` to enter Insert mode
- Press \`Esc\` to return to Normal mode
- Press **Ctrl+S** to save
- Press **Ctrl+,** for settings
- Press **Alt+J** / **Alt+K** to switch tabs
`;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <nav id="tabs" class="tabbar" aria-label="Open files" hidden></nav>
      <section id="editor" aria-label="Markdown editor"></section>
      <footer class="statusbar" data-tauri-drag-region><span id="message">Ready</span><span class="status-document"><span id="document-label">Untitled.md</span><span id="position">Ln 1, Col 1</span></span></footer>
    </main>
    <dialog id="settings" class="settings-dialog" aria-labelledby="settings-title">
      <form method="dialog">
        <header class="settings-header">
          <div><span class="eyebrow">Configuration</span><h2 id="settings-title">Settings</h2></div>
          <button class="icon-button" value="close" aria-label="Close settings">×</button>
        </header>
        <section class="settings-section">
          <div><h3>Appearance</h3><p>Choose how the editor looks.</p></div>
          <label class="setting-row" for="theme"><span>Theme</span>
            <select id="theme" aria-label="Color theme">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label class="setting-row" for="line-numbers">
            <span><strong>Line numbers</strong><small>Show document line numbers beside the editor.</small></span>
            <input id="line-numbers" class="setting-checkbox" type="checkbox">
          </label>
          <label class="setting-row" for="leader-key">
            <span><strong>Vim leader</strong><small>Press this key, then x, to toggle a task.</small></span>
            <button id="leader-key" class="key-capture" type="button" title="Click, then press a key"></button>
          </label>
        </section>
        <p class="settings-hint"><kbd>Esc</kbd> to close</p>
      </form>
    </dialog>`;

  const editorHost = root.querySelector<HTMLElement>("#editor")!;
  const tabbar = root.querySelector<HTMLElement>("#tabs")!;
  const message = root.querySelector<HTMLElement>("#message")!;
  const documentLabel = root.querySelector<HTMLElement>("#document-label")!;
  const position = root.querySelector<HTMLElement>("#position")!;
  const settings = root.querySelector<HTMLDialogElement>("#settings")!;
  const themeSelect = root.querySelector<HTMLSelectElement>("#theme")!;
  const leaderButton = root.querySelector<HTMLButtonElement>("#leader-key")!;
  const lineNumbersToggle = root.querySelector<HTMLInputElement>("#line-numbers")!;
  const themes = new ThemeController();
  let leader = loadLeader();
  let showLineNumbers = loadLineNumbers();
  themeSelect.value = themes.value;
  lineNumbersToggle.checked = showLineNumbers;
  leaderButton.textContent = describeLeader(leader);

  let editor: MarkdownEditor;
  let controller: DocumentController;
  let documentState: DocumentState = { path: null, name: "Untitled.md", dirty: false, tabs: [] };
  let messageTimer: number | undefined;

  const showMessage = (text: string, error = false): void => {
    message.textContent = text;
    message.classList.toggle("error", error);
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => {
      message.textContent = "Ready";
      message.classList.remove("error");
    }, 5000);
  };
  const openSettings = (): void => {
    if (!settings.open) settings.showModal();
  };
  const updateState = (state: DocumentState): void => {
    documentState = state;
    document.title = `${state.dirty ? "• " : ""}${state.name} — Markdown Thing`;
    documentLabel.textContent = `${state.dirty ? "• " : ""}${state.name}`;
    documentLabel.setAttribute("aria-label", `${state.name}${state.dirty ? ", unsaved changes" : ""}`);
    tabbar.hidden = state.tabs.length < 2;
    tabbar.replaceChildren(...state.tabs.map((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tabId = String(tab.id);
      button.className = `tab${tab.active ? " active" : ""}`;
      button.textContent = `${tab.dirty ? "• " : ""}${tab.name}`;
      button.title = tab.path ?? tab.name;
      button.setAttribute("aria-label", `${tab.name}${tab.dirty ? ", unsaved changes" : ""}`);
      if (tab.active) button.setAttribute("aria-current", "page");
      return button;
    }));
    editor?.setContext(state.path, themes.resolved);
  };

  editor = createEditor({
    parent: editorHost,
    initialDocument: WELCOME,
    theme: themes.resolved,
    leader,
    lineNumbers: showLineNumbers,
    actions: {
      save: () => { void controller.save(); },
      settings: openSettings,
      nextTab: () => controller.switchRelative(1),
      previousTab: () => controller.switchRelative(-1),
      selectTab: (index) => controller.switchToIndex(index),
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

  tabbar.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-tab-id]");
    if (button) {
      controller.switchTo(Number(button.dataset.tabId));
      editor.focus();
    }
  });
  themeSelect.addEventListener("change", () => themes.set(themeSelect.value as ThemePreference));
  lineNumbersToggle.addEventListener("change", () => {
    showLineNumbers = lineNumbersToggle.checked;
    saveLineNumbers(showLineNumbers);
    editor.setLineNumbers(showLineNumbers);
  });
  let capturingLeader = false;
  leaderButton.addEventListener("click", () => {
    capturingLeader = true;
    leaderButton.textContent = "Press a key…";
  });
  leaderButton.addEventListener("keydown", (event) => {
    if (!capturingLeader || event.ctrlKey || event.altKey || event.metaKey) return;
    const nextLeader = normalizeLeader(event.key);
    if (!nextLeader) return;
    event.preventDefault();
    leader = nextLeader;
    saveLeader(leader);
    editor.setLeader(leader);
    leaderButton.textContent = describeLeader(leader);
    capturingLeader = false;
  });
  leaderButton.addEventListener("blur", () => {
    capturingLeader = false;
    leaderButton.textContent = describeLeader(leader);
  });
  settings.addEventListener("close", () => editor.focus());
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === ",") {
      event.preventDefault();
      openSettings();
    }
  });
  themes.subscribe((theme) => editor.setContext(documentState.path, theme));

  const drainLaunchQueue = async (): Promise<void> => {
    try {
      for (const item of await tauriFiles.drainLaunchQueue()) {
        if (item.type === "document") controller.openDocument(item.payload);
        else showMessage(item.payload, true);
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };
  const initializeFiles = async (): Promise<void> => {
    await controller.openInitial();
    await listen("launch-queued", () => { void drainLaunchQueue(); });
    await drainLaunchQueue();
  };
  editor.focus();
  void initializeFiles();
}
