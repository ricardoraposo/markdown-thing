# Pi extension

Load the extension directly while testing:

```bash
pi -e /path/to/markdown-thing/pi-extension/index.ts
```

Enable streaming inside Pi before sending a prompt:

```text
/markdown-thing
```

The command supports:

```text
/markdown-thing on
/markdown-thing off
/markdown-thing status
```

Each agent run opens one temporary Markdown Thing tab and streams assistant text into it. Tool execution remains in Pi. Streaming stays enabled for later responses until `/markdown-thing off` or the Pi session is replaced.

Set `MARKDOWN_THING_BIN` when the executable is not available as `markdown-thing` on `PATH`:

```bash
MARKDOWN_THING_BIN=/absolute/path/to/markdown-thing pi -e /path/to/markdown-thing/pi-extension/index.ts
```
