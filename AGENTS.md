# AGENTS.md

Instructions for contributors and coding agents working in this repository.

## Product boundaries

Markdown Thing is a lightweight, Linux-first, Vim-first Tauri desktop editor. The editor surface itself is the rendered view.

- Keep `EditorState.doc` as the sole source of truth and preserve its Markdown bytes exactly unless the user edits them.
- Implement rendering with CodeMirror decorations and widgets. Never add a split preview or separate preview mode.
- Keep Vim bindings primary.
- Do not introduce React, ProseMirror, Electron, a frontend component framework, export, file watching, or a plugin system without explicit product approval.
- Keep file opening command-line-only. Do not add file pickers, Open buttons, Save As dialogs, or permanent toolbar chrome.
- Keep tabs minimal and create them only when later command-line launches target additional files.
- Mermaid must remain dynamically imported. Do not add it to the initial application chunk.

## Architecture

- `src/editor/markdownModel.ts`: pure Markdown syntax-tree classification and reveal rules
- `src/editor/livePreview.ts`: CodeMirror decoration assembly and preview state
- `src/editor/widgets/`: async image and Mermaid widgets
- `src/file/`: frontend document state and narrow Tauri adapters
- `src/theme/`: theme preference and CodeMirror themes
- `src-tauri/src/files.rs`: command-line path resolution, UTF-8 file I/O, and constrained local image loading

Keep frontend business logic independently testable. Sort CodeMirror decoration ranges, avoid overlapping replacements, and reveal complete source constructs whenever any cursor or selection intersects them.

## Security

- Do not add shell permissions or broad filesystem/plugin capabilities.
- Native file access must remain limited to canonical paths authorized by command-line launches.
- Keep the CSP restrictive. Do not enable arbitrary scripts, raw Markdown HTML, `file:` images, or insecure remote image schemes.
- Canonicalize local image paths, keep them inside the document directory, validate image MIME types, and retain the size limit.
- Render Mermaid with strict security and HTML labels disabled.

## Commands

Run before handing off changes:

```bash
pnpm run check
pnpm test -- --run
pnpm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

For packaging changes, also run:

```bash
pnpm run tauri:build
```

Use strict TypeScript without suppressing errors. Format Rust with `cargo fmt`, keep Clippy warning-free, and add focused tests for source preservation, selection boundaries, cancellation/error behavior, and native path validation.
