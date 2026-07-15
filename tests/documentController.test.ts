import { describe, expect, it, vi } from "vitest";
import { DocumentController, type DocumentState } from "../src/file/documentController";
import type { FileAdapter, OpenedDocument } from "../src/file/tauriFiles";
import { EditorState } from "@codemirror/state";
import { prepareDocument, serializeDocument } from "../src/editor/lineEndings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(files: FileAdapter, initial = "initial") {
  let text = initial;
  const states: DocumentState[] = [];
  const errors: string[] = [];
  const controller = new DocumentController({
    files,
    getText: () => text,
    setText: (value) => { text = value; },
    onState: (state) => states.push(state),
    onError: (error) => errors.push(error),
  });
  return { controller, states, errors, setText: (value: string) => { text = value; controller.changed(); }, text: () => text };
}

const adapter = (overrides: Partial<FileAdapter> = {}): FileAdapter => ({
  open: vi.fn(async () => null),
  save: vi.fn(async (path) => ({ path })),
  saveAs: vi.fn(async () => null),
  ...overrides,
});

describe("DocumentController", () => {
  it("opens a file and establishes a clean saved baseline", async () => {
    const subject = setup(adapter({ open: async () => ({ path: "/notes/a.md", content: "opened" }) }));
    await subject.controller.open();
    expect(subject.text()).toBe("opened");
    expect(subject.controller.state).toEqual({ path: "/notes/a.md", name: "a.md", dirty: false });
  });

  it("tracks changes and clears dirty only after a successful save", async () => {
    const files = adapter({ saveAs: async () => ({ path: "/notes/new.md" }) });
    const subject = setup(files);
    subject.setText("changed");
    expect(subject.controller.state.dirty).toBe(true);
    await subject.controller.save();
    expect(subject.controller.state).toMatchObject({ path: "/notes/new.md", dirty: false });
  });

  it("leaves state unchanged when a dialog is cancelled", async () => {
    const subject = setup(adapter());
    await subject.controller.open();
    await subject.controller.saveAs();
    expect(subject.controller.state).toEqual({ path: null, name: "Untitled.md", dirty: false });
  });

  it("reports save errors and remains dirty", async () => {
    const subject = setup(adapter({ saveAs: async () => { throw new Error("disk full"); } }));
    subject.setText("changed");
    await subject.controller.save();
    expect(subject.errors).toEqual(["disk full"]);
    expect(subject.controller.state.dirty).toBe(true);
  });

  it("keeps edits made while a save is pending dirty", async () => {
    let finishSave: ((value: { path: string }) => void) | undefined;
    const pending = new Promise<{ path: string }>((resolve) => { finishSave = resolve; });
    const subject = setup(adapter({ saveAs: () => pending }));
    subject.setText("submitted");
    const saving = subject.controller.save();
    subject.setText("newer edit");
    finishSave?.({ path: "/notes/race.md" });
    await saving;
    expect(subject.controller.state).toMatchObject({ path: "/notes/race.md", dirty: true });
  });

  it("ignores a stale save result after a newer document opens", async () => {
    const pendingSave = deferred<{ path: string }>();
    let openCount = 0;
    const files = adapter({
      open: async () => ++openCount === 1
        ? { path: "/notes/a.md", content: "A" }
        : { path: "/notes/b.md", content: "B" },
      save: () => pendingSave.promise,
    });
    const subject = setup(files);
    await subject.controller.open();
    subject.setText("A edited");
    const saving = subject.controller.save();
    await subject.controller.open();
    pendingSave.resolve({ path: "/notes/a.md" });
    await saving;
    expect(subject.text()).toBe("B");
    expect(subject.controller.state).toEqual({ path: "/notes/b.md", name: "b.md", dirty: false });
  });

  it("ignores a stale open result when a newer open completes first", async () => {
    const firstOpen = deferred<OpenedDocument | null>();
    let openCount = 0;
    const subject = setup(adapter({
      open: () => ++openCount === 1
        ? firstOpen.promise
        : Promise.resolve({ path: "/notes/newer.md", content: "newer" }),
    }));
    const stale = subject.controller.open();
    await subject.controller.open();
    firstOpen.resolve({ path: "/notes/stale.md", content: "stale" });
    await stale;
    expect(subject.text()).toBe("newer");
    expect(subject.controller.state.path).toBe("/notes/newer.md");
  });

  it("opens and saves a CRLF document without changing its line endings", async () => {
    let editorState = EditorState.create();
    let saved = "";
    const files = adapter({
      open: async () => ({ path: "/notes/windows.md", content: "one\r\ntwo\r\n" }),
      save: async (path, content) => { saved = content; return { path }; },
    });
    const controller = new DocumentController({
      files,
      getText: () => serializeDocument(editorState),
      setText: (source) => {
        const prepared = prepareDocument(source);
        editorState = EditorState.create({
          doc: prepared.text,
          extensions: [EditorState.lineSeparator.of(prepared.lineSeparator)],
        });
      },
      onState: () => undefined,
      onError: (error) => { throw new Error(error); },
    });
    await controller.open();
    expect(controller.state.dirty).toBe(false);
    await controller.save();
    expect(saved).toBe("one\r\ntwo\r\n");
  });
});
