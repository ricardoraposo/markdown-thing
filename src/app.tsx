import { listen } from "@tauri-apps/api/event";
import { Index, createSignal, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { createEditor, type EditorOptions, type MarkdownEditor } from "./editor/createEditor";
import { DEFAULT_FONT_SIZE, loadFontSize, normalizeFontSize, saveFontSize } from "./editor/fontSizePreference";
import { describeLeader, loadLeader, normalizeLeader, saveLeader } from "./editor/leaderPreference";
import { loadLineNumbers, saveLineNumbers } from "./editor/lineNumberPreference";
import { DocumentController, type DocumentState } from "./file/documentController";
import { tauriFiles, type FileAdapter } from "./file/tauriFiles";
import { ThemeController, type ResolvedTheme, type ThemePreference } from "./theme/themeController";

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
- Press **Ctrl+=** / **Ctrl+-** to change the font size
- Press **Alt+J** / **Alt+K** to switch tabs
`;

interface AppTheme {
  readonly value: ThemePreference;
  readonly resolved: ResolvedTheme;
  set(preference: ThemePreference): void;
  subscribe(listener: (theme: ResolvedTheme) => void): VoidFunction;
  destroy(): void;
}

export interface AppDependencies {
  files: FileAdapter;
  createEditor(options: EditorOptions): MarkdownEditor;
  createTheme(): AppTheme;
  listenForLaunch(handler: VoidFunction): Promise<VoidFunction>;
}

const productionDependencies: AppDependencies = {
  files: tauriFiles,
  createEditor,
  createTheme: () => new ThemeController(),
  listenForLaunch: async (handler) => listen("launch-queued", handler),
};

const INITIAL_DOCUMENT_STATE: DocumentState = {
  path: null,
  name: "Untitled.md",
  ephemeral: false,
  dirty: false,
  tabs: [],
};

function App(props: { dependencies: AppDependencies }) {
  const [documentState, setDocumentState] = createSignal<DocumentState>(INITIAL_DOCUMENT_STATE);
  const [message, setMessage] = createSignal("Ready");
  const [messageIsError, setMessageIsError] = createSignal(false);
  const [position, setPosition] = createSignal("Ln 1, Col 1");
  const [themePreference, setThemePreference] = createSignal<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = createSignal<ResolvedTheme>("light");
  const [leader, setLeader] = createSignal("\\");
  const [showLineNumbers, setShowLineNumbers] = createSignal(false);
  const [fontSize, setFontSize] = createSignal(DEFAULT_FONT_SIZE);
  const [capturingLeader, setCapturingLeader] = createSignal(false);

  let editorHost!: HTMLElement;
  let settings!: HTMLDialogElement;
  let editor: MarkdownEditor | undefined;
  let controller: DocumentController | undefined;
  let themes: AppTheme | undefined;
  let unsubscribeTheme: VoidFunction | undefined;
  let unlistenLaunch: VoidFunction | undefined;
  let messageTimer: number | undefined;
  let disposed = false;
  let drainChain: Promise<void> = Promise.resolve();

  const showMessage = (text: string, error = false): void => {
    if (disposed) return;
    setMessage(text);
    setMessageIsError(error);
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => {
      if (disposed) return;
      setMessage("Ready");
      setMessageIsError(false);
    }, 5000);
  };

  const openSettings = (): void => {
    if (!settings.open) settings.showModal();
  };

  const updateFontSize = (value: number): void => {
    const next = normalizeFontSize(value);
    setFontSize(next);
    saveFontSize(next);
    editor?.setFontSize(next);
  };

  const updateState = (state: DocumentState): void => {
    if (disposed) return;
    setDocumentState(state);
    document.title = `${state.dirty ? "• " : ""}${state.name} — Markdown Thing`;
    editor?.setContext(state.path, resolvedTheme());
  };

  const processLaunchQueue = (): Promise<void> => {
    drainChain = drainChain.then(async () => {
      if (disposed) return;
      try {
        const items = await props.dependencies.files.drainLaunchQueue();
        if (disposed) return;
        for (const item of items) {
          if (item.type === "document") controller?.openDocument(item.payload);
          else if (item.type === "ephemeral") controller?.openEphemeral(item.payload);
          else showMessage(item.payload, true);
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), true);
      }
    });
    return drainChain;
  };

  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === ",") {
      event.preventDefault();
      openSettings();
    }
  };

  onMount(() => {
    themes = props.dependencies.createTheme();
    setThemePreference(themes.value);
    setResolvedTheme(themes.resolved);
    setLeader(loadLeader());
    setShowLineNumbers(loadLineNumbers());
    setFontSize(loadFontSize());

    editor = props.dependencies.createEditor({
      parent: editorHost,
      initialDocument: WELCOME,
      theme: themes.resolved,
      leader: leader(),
      lineNumbers: showLineNumbers(),
      fontSize: fontSize(),
      actions: {
        save: () => { void controller?.save(); },
        settings: openSettings,
        increaseFontSize: () => updateFontSize(fontSize() + 1),
        decreaseFontSize: () => updateFontSize(fontSize() - 1),
        nextTab: () => controller?.switchRelative(1),
        previousTab: () => controller?.switchRelative(-1),
        selectTab: (index) => controller?.switchToIndex(index),
      },
      onChange: (text) => controller?.changed(text),
      onCursor: (line, column) => setPosition(`Ln ${line}, Col ${column}`),
    });

    controller = new DocumentController({
      files: props.dependencies.files,
      getText: () => editor!.text(),
      setText: (text) => editor!.replace(text),
      onState: updateState,
      onError: (error) => showMessage(error, true),
    });

    unsubscribeTheme = themes.subscribe((theme) => {
      if (disposed) return;
      setResolvedTheme(theme);
      editor?.setContext(documentState().path, theme);
    });
    document.addEventListener("keydown", onDocumentKeyDown);
    editor.focus();

    const initializeFiles = async (): Promise<void> => {
      await controller!.openInitial();
      if (disposed) return;
      try {
        const stopListening = await props.dependencies.listenForLaunch(() => { void processLaunchQueue(); });
        if (disposed) {
          stopListening();
          return;
        }
        unlistenLaunch = stopListening;
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), true);
      }
      if (!disposed) await processLaunchQueue();
    };
    void initializeFiles();

    onCleanup(() => {
      disposed = true;
      window.clearTimeout(messageTimer);
      document.removeEventListener("keydown", onDocumentKeyDown);
      controller?.dispose();
      unsubscribeTheme?.();
      unlistenLaunch?.();
      themes?.destroy();
      editor?.destroy();
    });
  });

  const selectTab = (id: number): void => {
    controller?.switchTo(id);
    editor?.focus();
  };

  const changeTheme = (event: Event): void => {
    const preference = (event.currentTarget as HTMLSelectElement).value as ThemePreference;
    setThemePreference(preference);
    themes?.set(preference);
  };

  const changeLineNumbers = (event: Event): void => {
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    setShowLineNumbers(enabled);
    saveLineNumbers(enabled);
    editor?.setLineNumbers(enabled);
  };

  const changeFontSize = (event: Event): void => {
    updateFontSize(Number((event.currentTarget as HTMLSelectElement).value));
  };

  const captureLeader = (event: KeyboardEvent): void => {
    if (!capturingLeader() || event.ctrlKey || event.altKey || event.metaKey) return;
    const nextLeader = normalizeLeader(event.key);
    if (!nextLeader) return;
    event.preventDefault();
    setLeader(nextLeader);
    saveLeader(nextLeader);
    editor?.setLeader(nextLeader);
    setCapturingLeader(false);
  };

  return (
    <>
      <main class="app-shell">
        <nav id="tabs" class="tabbar" aria-label="Open files" hidden={documentState().tabs.length < 2}>
          <Index each={documentState().tabs}>
            {(tab) => (
              <button
                type="button"
                data-tab-id={tab().id}
                class={`tab${tab().active ? " active" : ""}`}
                title={tab().ephemeral ? `${tab().name} (temporary agent output)` : (tab().path ?? tab().name)}
                aria-label={`${tab().name}${tab().ephemeral ? ", temporary agent output" : ""}${tab().dirty ? ", unsaved changes" : ""}`}
                aria-current={tab().active ? "page" : undefined}
                onClick={() => selectTab(tab().id)}
              >
                {tab().dirty ? "• " : ""}{tab().name}
              </button>
            )}
          </Index>
        </nav>
        <section id="editor" aria-label="Markdown editor" ref={editorHost} />
        <footer class="statusbar" data-tauri-drag-region>
          <span id="message" classList={{ error: messageIsError() }}>{message()}</span>
          <span class="status-document">
            <span
              id="document-label"
              aria-label={`${documentState().name}${documentState().dirty ? ", unsaved changes" : ""}`}
            >
              {documentState().dirty ? "• " : ""}{documentState().name}
            </span>
            <span id="position">{position()}</span>
          </span>
        </footer>
      </main>
      <dialog
        id="settings"
        class="settings-dialog"
        aria-labelledby="settings-title"
        ref={settings}
        onClose={() => editor?.focus()}
      >
        <form method="dialog">
          <header class="settings-header">
            <div><span class="eyebrow">Configuration</span><h2 id="settings-title">Settings</h2></div>
            <button class="icon-button" value="close" aria-label="Close settings">×</button>
          </header>
          <section class="settings-section">
            <div><h3>Appearance</h3><p>Choose how the editor looks.</p></div>
            <label class="setting-row" for="theme"><span>Theme</span>
              <select id="theme" aria-label="Color theme" value={themePreference()} onChange={changeTheme}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label class="setting-row" for="font-size">
              <span><strong>Font size</strong><small>Change with Ctrl+= and Ctrl+-.</small></span>
              <select id="font-size" aria-label="Editor font size" value={fontSize()} onChange={changeFontSize}>
                {Array.from({ length: 13 }, (_, index) => index + 12).map((size) => (
                  <option value={size}>{size} px</option>
                ))}
              </select>
            </label>
            <label class="setting-row" for="line-numbers">
              <span><strong>Line numbers</strong><small>Show document line numbers beside the editor.</small></span>
              <input
                id="line-numbers"
                class="setting-checkbox"
                type="checkbox"
                checked={showLineNumbers()}
                onChange={changeLineNumbers}
              />
            </label>
            <label class="setting-row" for="leader-key">
              <span><strong>Vim leader</strong><small>Press this key, then x, to toggle a task.</small></span>
              <button
                id="leader-key"
                class="key-capture"
                type="button"
                title="Click, then press a key"
                onClick={() => setCapturingLeader(true)}
                onKeyDown={captureLeader}
                onBlur={() => setCapturingLeader(false)}
              >
                {capturingLeader() ? "Press a key…" : describeLeader(leader())}
              </button>
            </label>
          </section>
          <p class="settings-hint"><kbd>Esc</kbd> to close</p>
        </form>
      </dialog>
    </>
  );
}

export function mountApp(
  root: HTMLElement,
  dependencies: AppDependencies = productionDependencies,
): VoidFunction {
  return render(() => <App dependencies={dependencies} />, root);
}
