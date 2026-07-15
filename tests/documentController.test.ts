import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { DocumentController, type DocumentState } from "../src/file/documentController";
import { prepareDocument, serializeDocument } from "../src/editor/lineEndings";
import type { FileAdapter } from "../src/file/tauriFiles";

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
  return {
    controller,
    states,
    errors,
    setText: (value: string) => { text = value; controller.changed(); },
    text: () => text,
  };
}

const adapter = (overrides: Partial<FileAdapter> = {}): FileAdapter => ({
  initial: vi.fn(async () => null),
  drainLaunchQueue: vi.fn(async () => []),
  save: vi.fn(async (path) => ({ path })),
  ...overrides,
});

describe("DocumentController", () => {
  it("loads the command-line file and replaces the clean placeholder tab", async () => {
    const subject = setup(adapter({ initial: async () => ({ path: "/notes/TODO.md", content: "# Todo" }) }));
    await subject.controller.openInitial();
    expect(subject.text()).toBe("# Todo");
    expect(subject.controller.state).toMatchObject({ path: "/notes/TODO.md", name: "TODO.md", dirty: false });
    expect(subject.controller.state.tabs).toHaveLength(1);
  });

  it("opens later command-line files in tabs and preserves each buffer", async () => {
    const subject = setup(adapter({ initial: async () => ({ path: "/notes/one.md", content: "one" }) }));
    await subject.controller.openInitial();
    subject.setText("one edited");
    subject.controller.openDocument({ path: "/notes/two.md", content: "two" });

    expect(subject.text()).toBe("two");
    expect(subject.controller.state.tabs).toHaveLength(2);
    const first = subject.controller.state.tabs[0]!;
    expect(first.dirty).toBe(true);

    subject.controller.switchTo(first.id);
    expect(subject.text()).toBe("one edited");
    expect(subject.controller.state.path).toBe("/notes/one.md");
  });

  it("switches tabs relatively and by number", async () => {
    const subject = setup(adapter({ initial: async () => ({ path: "/notes/one.md", content: "one" }) }));
    await subject.controller.openInitial();
    subject.controller.openDocument({ path: "/notes/two.md", content: "two" });
    subject.controller.openDocument({ path: "/notes/three.md", content: "three" });

    subject.controller.switchRelative(-1);
    expect(subject.controller.state.name).toBe("two.md");
    subject.controller.switchRelative(1);
    expect(subject.controller.state.name).toBe("three.md");
    subject.controller.switchToIndex(0);
    expect(subject.controller.state.name).toBe("one.md");
  });

  it("focuses an existing tab without overwriting unsaved text", async () => {
    const subject = setup(adapter({ initial: async () => ({ path: "/notes/one.md", content: "one" }) }));
    await subject.controller.openInitial();
    subject.setText("unsaved");
    subject.controller.openDocument({ path: "/notes/two.md", content: "two" });
    subject.controller.openDocument({ path: "/notes/one.md", content: "disk changed" });
    expect(subject.text()).toBe("unsaved");
    expect(subject.controller.state.tabs).toHaveLength(2);
  });

  it("tracks changes and clears dirty only after a successful save", async () => {
    const subject = setup(adapter({ initial: async () => ({ path: "/notes/TODO.md", content: "initial" }) }));
    await subject.controller.openInitial();
    subject.setText("changed");
    expect(subject.controller.state.dirty).toBe(true);
    await subject.controller.save();
    expect(subject.controller.state.dirty).toBe(false);
  });

  it("does not open a picker when an untitled document is saved", async () => {
    const subject = setup(adapter());
    subject.setText("changed");
    await subject.controller.save();
    expect(subject.errors).toEqual(["Open a file from the terminal before saving"]);
    expect(subject.controller.state.dirty).toBe(true);
  });

  it("keeps newer edits dirty when a save finishes", async () => {
    let finishSave: ((value: { path: string }) => void) | undefined;
    const pending = new Promise<{ path: string }>((resolve) => { finishSave = resolve; });
    const subject = setup(adapter({
      initial: async () => ({ path: "/notes/race.md", content: "initial" }),
      save: () => pending,
    }));
    await subject.controller.openInitial();
    subject.setText("submitted");
    const saving = subject.controller.save();
    subject.setText("newer edit");
    finishSave?.({ path: "/notes/race.md" });
    await saving;
    expect(subject.controller.state.dirty).toBe(true);
  });

  it("opens and saves a CRLF document without changing its line endings", async () => {
    let editorState = EditorState.create();
    let saved = "";
    const files = adapter({
      initial: async () => ({ path: "/notes/windows.md", content: "one\r\ntwo\r\n" }),
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
    await controller.openInitial();
    expect(controller.state.dirty).toBe(false);
    await controller.save();
    expect(saved).toBe("one\r\ntwo\r\n");
  });
});
