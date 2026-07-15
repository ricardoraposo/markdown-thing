# Markdown Thing

A small Linux-first desktop Markdown editor where the rendered document **is** the editing surface. Markdown remains the exact source of truth, while inactive syntax is styled or replaced inline. Move the cursor into a construct to reveal and edit its source.

## MVP features

- Vim-first editing through CodeMirror 6 (`Normal`, `Insert`, visual selections, search, undo/redo, and standard Vim motions/operators)
- Inline headings, emphasis, strong emphasis, links, circular bullets, and full-width dividers
- Interactive `- [ ]` task lists with mouse and Vim toggles
- Inline local, HTTPS, and `data:image/*` images
- Lazy-rendered Mermaid fenced blocks
- Command-line-only file opening with no picker or toolbar chrome
- Detached terminal launches and single-instance tabs for additional files
- Dirty-file indicator and cursor position
- System, light, and dark themes configured with `Ctrl+,`
- No preview pane and no rich-text document conversion

## Linux prerequisites

Install Node.js, pnpm, Rust, and the Tauri 2 Linux dependencies. On Debian/Ubuntu-like systems:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for other distributions.

## Develop

```bash
pnpm install
pnpm run tauri:dev
```

`pnpm run dev` starts the web frontend alone, but command-line file loading and relative local images require the Tauri application.

## Use

Open a file from its directory or with an absolute path. Release builds return control to the terminal immediately. Opening another file while the app is running adds or focuses its tab.

```bash
markdown-thing TODO.md
markdown-thing /home/rick/Documents/notes.md
```

The editor starts in Vim Normal mode.

| Action | Shortcut |
| --- | --- |
| Enter Insert mode | `i`, `a`, `o`, and other Vim commands |
| Return to Normal mode | `Esc` |
| Save active file | `Ctrl+S` |
| Settings | `Ctrl+,` |
| Toggle task under cursor | `<leader>x` (default leader: `\\`) |
| Previous / next tab | `Alt+J` / `Alt+K` |
| Select tab 1–9 | `Alt+1` … `Alt+9` |
| Search | `/` in Normal mode |
| Undo / redo | `u` / `Ctrl+R` in Normal mode |

Supported live constructs are ATX headings, emphasis, strong emphasis, inline links, circular bullet lists, horizontal rules, interactive task lists, Markdown images, and fenced blocks whose info string is `mermaid`. The Vim leader key can be changed from the `Ctrl+,` settings modal. Code blocks other than Mermaid remain source text with syntax highlighting.

Relative images are resolved from the Markdown file's directory and must remain within that directory. The native backend only saves or resolves images for document paths authorized by command-line launches. Local PNG, JPEG, GIF, and WebP images are content-validated and limited to 10 MiB. Remote images must use HTTPS.

Uniform LF, CRLF, and bare-CR line endings are preserved when files are opened and saved. Files containing a mixture of line-ending styles are normalized to LF on load so the editor does not need a second shadow document model.

## Validate and package

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm test -- --run
pnpm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm run tauri:build
```

Linux bundles are written below `src-tauri/target/release/bundle/`.

## MVP limits

This version intentionally has no file picker, split preview, export, autosave, file watching, plugin system, full settings screen, unsaved-close prompt, or non-UTF-8 file support. Mermaid is loaded only when a rendered Mermaid block is needed. Markdown HTML is never rendered directly.
