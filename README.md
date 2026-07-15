# Markdown Thing

A small Linux-first desktop Markdown editor where the rendered document **is** the editing surface. Markdown remains the exact source of truth, while inactive syntax is styled or replaced inline. Move the cursor into a construct to reveal and edit its source.

## MVP features

- Vim-first editing through CodeMirror 6 (`Normal`, `Insert`, visual selections, search, undo/redo, and standard Vim motions/operators)
- Inline headings, emphasis, strong emphasis, and links
- Inline local, HTTPS, and `data:image/*` images
- Lazy-rendered Mermaid fenced blocks
- Native Open, Save, and Save As dialogs
- Dirty-file indicator and cursor position
- System, light, and dark themes
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

`pnpm run dev` starts the web frontend alone, but native file dialogs and relative local images require the Tauri application.

## Use

The editor starts in Vim Normal mode.

| Action | Shortcut |
| --- | --- |
| Enter Insert mode | `i`, `a`, `o`, and other Vim commands |
| Return to Normal mode | `Esc` |
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Search | `/` in Normal mode |
| Undo / redo | `u` / `Ctrl+R` in Normal mode |

Supported live constructs are ATX headings, emphasis, strong emphasis, inline links, Markdown images, and fenced blocks whose info string is `mermaid`. Code blocks other than Mermaid remain source text with syntax highlighting.

Relative images are resolved from the Markdown file's directory and must remain within that directory. The native backend only saves or resolves images for document paths explicitly selected through Open or Save As. Local PNG, JPEG, GIF, and WebP images are content-validated and limited to 10 MiB. Remote images must use HTTPS.

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

This first version intentionally has no tabs, split preview, export, autosave, file watching, plugin system, settings screen, unsaved-close prompt, or non-UTF-8 file support. Mermaid is loaded only when a rendered Mermaid block is needed. Markdown HTML is never rendered directly.
