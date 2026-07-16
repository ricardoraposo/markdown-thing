// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type AppDependencies } from "../src/app";
import type { EditorOptions, MarkdownEditor } from "../src/editor/createEditor";
import type { FileAdapter, LaunchItem } from "../src/file/tauriFiles";
import type { ResolvedTheme, ThemePreference } from "../src/theme/themeController";

interface FakeEditor {
  editor: MarkdownEditor;
  edit(text: string): void;
  options(): EditorOptions;
}

function createFakeEditor(): FakeEditor {
  let source = "";
  let captured: EditorOptions | undefined;
  const editor = {
    view: {} as MarkdownEditor["view"],
    text: vi.fn(() => source),
    replace: vi.fn((text: string) => { source = text; }),
    setContext: vi.fn(),
    setLeader: vi.fn(),
    setLineNumbers: vi.fn(),
    setFontSize: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
  } satisfies MarkdownEditor;

  return {
    editor,
    edit(text) {
      source = text;
      captured?.onChange(text);
    },
    options: () => {
      if (!captured) throw new Error("Editor was not created");
      return captured;
    },
    set optionsForFactory(options: EditorOptions) {
      captured = options;
      source = options.initialDocument;
    },
  } as FakeEditor & { optionsForFactory: EditorOptions };
}

class FakeTheme {
  value: ThemePreference = "system";
  resolved: ResolvedTheme = "light";
  readonly set = vi.fn((preference: ThemePreference) => { this.value = preference; });
  readonly destroy = vi.fn();
  readonly unsubscribe = vi.fn();
  private listener: ((theme: ResolvedTheme) => void) | undefined;

  subscribe(listener: (theme: ResolvedTheme) => void): VoidFunction {
    this.listener = listener;
    listener(this.resolved);
    return this.unsubscribe;
  }

  emit(theme: ResolvedTheme): void {
    this.resolved = theme;
    this.listener?.(theme);
  }
}

function adapter(overrides: Partial<FileAdapter> = {}): FileAdapter {
  return {
    initial: vi.fn(async () => null),
    drainLaunchQueue: vi.fn(async () => []),
    save: vi.fn(async (path) => ({ path })),
    ...overrides,
  };
}

function setup(options: {
  files?: FileAdapter;
  theme?: FakeTheme;
  listenForLaunch?: AppDependencies["listenForLaunch"];
} = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const fake = createFakeEditor() as FakeEditor & { optionsForFactory: EditorOptions };
  const theme = options.theme ?? new FakeTheme();
  const unlisten = vi.fn();
  let launchHandler: VoidFunction | undefined;
  const dependencies: AppDependencies = {
    files: options.files ?? adapter(),
    createEditor: (editorOptions) => {
      fake.optionsForFactory = editorOptions;
      return fake.editor;
    },
    createTheme: () => theme,
    listenForLaunch: options.listenForLaunch ?? vi.fn(async (handler) => {
      launchHandler = handler;
      return unlisten;
    }),
  };
  const dispose = mountApp(root, dependencies);
  return { root, fake, theme, unlisten, dispose, launch: () => launchHandler?.() };
}

const mounted: VoidFunction[] = [];
const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  });
  document.title = "Markdown Thing";
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); }),
  });
});

afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Solid application shell", () => {
  it("renders the existing shell and creates one editor with stored preferences", async () => {
    localStorage.setItem("markdown-thing-vim-leader", " ");
    localStorage.setItem("markdown-thing-line-numbers", "true");
    localStorage.setItem("markdown-thing-font-size", "18");
    const subject = setup();
    mounted.push(subject.dispose);

    expect(subject.root.querySelector("main.app-shell")).not.toBeNull();
    expect(subject.root.querySelector('nav[aria-label="Open files"]')).not.toBeNull();
    expect(subject.root.querySelector('section[aria-label="Markdown editor"]')).not.toBeNull();
    expect(subject.root.querySelector("#message")?.textContent).toBe("Ready");
    expect(subject.root.querySelector("#document-label")?.textContent).toBe("Untitled.md");
    expect(subject.root.querySelector("#position")?.textContent).toBe("Ln 1, Col 1");
    expect(subject.root.querySelector("#settings")?.getAttribute("aria-labelledby")).toBe("settings-title");

    const editorOptions = subject.fake.options();
    expect(editorOptions.parent).toBe(subject.root.querySelector("#editor"));
    expect(editorOptions.initialDocument).toContain("markdown-thing README.md");
    expect(editorOptions.theme).toBe("light");
    expect(editorOptions.leader).toBe(" ");
    expect(editorOptions.lineNumbers).toBe(true);
    expect(editorOptions.fontSize).toBe(18);
    expect(subject.fake.editor.focus).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(subject.unlisten).not.toHaveBeenCalled());
  });

  it("reflects files, edits, cursor movement, saves, and tab selection", async () => {
    let queued: LaunchItem[] = [{
      type: "document",
      payload: { path: "/notes/two.md", content: "two" },
    }];
    const files = adapter({
      initial: vi.fn(async () => ({ path: "/notes/one.md", content: "one" })),
      drainLaunchQueue: vi.fn(async () => {
        const result = queued;
        queued = [];
        return result;
      }),
    });
    const subject = setup({ files });
    mounted.push(subject.dispose);

    await vi.waitFor(() => expect(subject.root.querySelectorAll("#tabs button")).toHaveLength(2));
    const buttons = subject.root.querySelectorAll<HTMLButtonElement>("#tabs button");
    expect(subject.root.querySelector("#tabs")?.hasAttribute("hidden")).toBe(false);
    expect(buttons[0]?.textContent).toBe("one.md");
    expect(buttons[1]?.getAttribute("aria-current")).toBe("page");
    expect(subject.fake.editor.replace).toHaveBeenLastCalledWith("two");

    subject.fake.edit("two changed");
    expect(document.title).toBe("• two.md — Markdown Thing");
    expect(buttons[1]?.textContent).toBe("• two.md");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("two.md, unsaved changes");
    subject.fake.options().onCursor(3, 7);
    expect(subject.root.querySelector("#position")?.textContent).toBe("Ln 3, Col 7");

    buttons[0]?.click();
    expect(subject.fake.editor.replace).toHaveBeenLastCalledWith("one");
    expect(subject.fake.editor.focus).toHaveBeenCalledTimes(2);
    subject.fake.options().actions.nextTab();
    expect(subject.fake.editor.replace).toHaveBeenLastCalledWith("two changed");
    subject.fake.options().actions.selectTab(0);
    expect(subject.fake.editor.replace).toHaveBeenLastCalledWith("one");

    subject.fake.edit("one changed");
    subject.fake.options().actions.save();
    await vi.waitFor(() => expect(files.save).toHaveBeenCalledWith("/notes/one.md", "one changed"));
    await vi.waitFor(() => expect(document.title).toBe("one.md — Markdown Thing"));
  });

  it("preserves settings shortcuts and preference controls", () => {
    const subject = setup();
    mounted.push(subject.dispose);
    const dialog = subject.root.querySelector<HTMLDialogElement>("#settings")!;
    const showModal = vi.mocked(dialog.showModal);

    const shortcut = new KeyboardEvent("keydown", { key: ",", ctrlKey: true, cancelable: true });
    document.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
    subject.fake.options().actions.settings();
    expect(showModal).toHaveBeenCalledTimes(1);

    dialog.dispatchEvent(new Event("close"));
    expect(subject.fake.editor.focus).toHaveBeenCalledTimes(2);
    const nearMiss = new KeyboardEvent("keydown", { key: ",", ctrlKey: true, shiftKey: true });
    document.dispatchEvent(nearMiss);
    expect(showModal).toHaveBeenCalledTimes(1);

    const theme = subject.root.querySelector<HTMLSelectElement>("#theme")!;
    theme.value = "dark";
    theme.dispatchEvent(new Event("change", { bubbles: true }));
    expect(subject.theme.set).toHaveBeenCalledWith("dark");
    subject.theme.emit("dark");
    expect(subject.fake.editor.setContext).toHaveBeenLastCalledWith(null, "dark");

    const lineNumbers = subject.root.querySelector<HTMLInputElement>("#line-numbers")!;
    lineNumbers.checked = true;
    lineNumbers.dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem("markdown-thing-line-numbers")).toBe("true");
    expect(subject.fake.editor.setLineNumbers).toHaveBeenCalledWith(true);

    const fontSize = subject.root.querySelector<HTMLSelectElement>("#font-size")!;
    fontSize.value = "20";
    fontSize.dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem("markdown-thing-font-size")).toBe("20");
    expect(subject.fake.editor.setFontSize).toHaveBeenCalledWith(20);
    subject.fake.options().actions.increaseFontSize();
    expect(subject.fake.editor.setFontSize).toHaveBeenLastCalledWith(21);
    subject.fake.options().actions.decreaseFontSize();
    expect(subject.fake.editor.setFontSize).toHaveBeenLastCalledWith(20);

    const leader = subject.root.querySelector<HTMLButtonElement>("#leader-key")!;
    leader.click();
    expect(leader.textContent).toBe("Press a key…");
    const key = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });
    leader.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(localStorage.getItem("markdown-thing-vim-leader")).toBe(" ");
    expect(subject.fake.editor.setLeader).toHaveBeenCalledWith(" ");
    expect(leader.textContent).toBe("Space");
  });

  it("serializes launch drains and resets errors after five seconds", async () => {
    vi.useFakeTimers();
    let releaseFirst: ((items: LaunchItem[]) => void) | undefined;
    const firstDrain = new Promise<LaunchItem[]>((resolve) => { releaseFirst = resolve; });
    const files = adapter({
      drainLaunchQueue: vi.fn()
        .mockImplementationOnce(() => firstDrain)
        .mockResolvedValueOnce([{ type: "error", payload: "second error" }]),
    });
    let launch: VoidFunction | undefined;
    const subject = setup({
      files,
      listenForLaunch: async (handler) => {
        launch = handler;
        return vi.fn();
      },
    });
    mounted.push(subject.dispose);
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(files.drainLaunchQueue).toHaveBeenCalledTimes(1));

    launch?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.drainLaunchQueue).toHaveBeenCalledTimes(1);
    releaseFirst?.([{ type: "error", payload: "first error" }]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(files.drainLaunchQueue).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(subject.root.querySelector("#message")?.textContent).toBe("second error");
    expect(subject.root.querySelector("#message")?.classList.contains("error")).toBe(true);

    await vi.advanceTimersByTimeAsync(4999);
    expect(subject.root.querySelector("#message")?.textContent).toBe("second error");
    await vi.advanceTimersByTimeAsync(1);
    expect(subject.root.querySelector("#message")?.textContent).toBe("Ready");
    expect(subject.root.querySelector("#message")?.classList.contains("error")).toBe(false);
  });

  it("disposes owned resources and immediately unlistens a late listener", async () => {
    let resolveListen: ((unlisten: VoidFunction) => void) | undefined;
    const listener = new Promise<VoidFunction>((resolve) => { resolveListen = resolve; });
    const listenForLaunch = vi.fn(() => listener);
    const subject = setup({ listenForLaunch });
    const destroy = vi.mocked(subject.fake.editor.destroy);
    const focusCalls = vi.mocked(subject.fake.editor.focus).mock.calls.length;

    await vi.waitFor(() => expect(listenForLaunch).toHaveBeenCalledTimes(1));
    subject.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(subject.theme.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subject.theme.destroy).toHaveBeenCalledTimes(1);
    expect(subject.root.childNodes).toHaveLength(0);

    const unlisten = vi.fn();
    resolveListen?.(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }));
    expect(subject.fake.editor.focus).toHaveBeenCalledTimes(focusCalls);
  });
});
