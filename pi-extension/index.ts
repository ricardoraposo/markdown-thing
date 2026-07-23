import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "markdown-thing";

interface ActiveStream {
  process: ChildProcessWithoutNullStreams;
  hasText: boolean;
  needsSeparator: boolean;
  ending: boolean;
  stderr: string;
}

function notifySafely(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning" | "error",
): void {
  try {
    ctx.ui.notify(message, level);
  } catch (error) {
    if (!/stale after session replacement/.test(String(error))) throw error;
  }
}

function setStatusSafely(ctx: ExtensionContext, value: string | undefined): void {
  try {
    ctx.ui.setStatus(STATUS_KEY, value);
  } catch (error) {
    if (!/stale after session replacement/.test(String(error))) throw error;
  }
}

export default function markdownThingExtension(pi: ExtensionAPI): void {
  let enabled = false;
  let active: ActiveStream | undefined;

  const stopActiveStream = (): void => {
    const stream = active;
    active = undefined;
    if (!stream || stream.ending) return;
    stream.ending = true;
    stream.process.stdin.end();
  };

  const disable = (ctx: ExtensionContext): void => {
    enabled = false;
    stopActiveStream();
    setStatusSafely(ctx, undefined);
  };

  const startActiveStream = (ctx: ExtensionContext): void => {
    stopActiveStream();
    const executable = process.env.MARKDOWN_THING_BIN?.trim() || "markdown-thing";
    const title = pi.getSessionName()?.trim() || "Pi response";
    const child = spawn(executable, ["stream", "--title", title]);
    const stream: ActiveStream = {
      process: child,
      hasText: false,
      needsSeparator: false,
      ending: false,
      stderr: "",
    };
    active = stream;
    child.stdout.resume();
    child.stdin.on("error", (error) => {
      stream.stderr = `${stream.stderr}${error.message}`.slice(-4096);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stream.stderr = `${stream.stderr}${chunk}`.slice(-4096);
    });
    child.on("error", (error) => {
      if (active === stream) active = undefined;
      enabled = false;
      setStatusSafely(ctx, undefined);
      notifySafely(ctx, `Markdown Thing could not start: ${error.message}`, "error");
    });
    child.on("close", (code) => {
      if (active !== stream || stream.ending) return;
      active = undefined;
      enabled = false;
      setStatusSafely(ctx, undefined);
      const detail = stream.stderr.trim();
      const message = detail || `Markdown Thing stream exited with code ${code ?? "unknown"}`;
      notifySafely(ctx, message, "error");
    });
  };

  const write = (content: string): void => {
    const stream = active;
    if (!stream || stream.ending || !stream.process.stdin.writable || content.length === 0) return;
    stream.process.stdin.write(content);
  };

  pi.registerCommand("markdown-thing", {
    description: "Stream future Pi responses to Markdown Thing",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const action = args.trim().toLowerCase() || "on";
      if (action === "status") {
        notifySafely(ctx, enabled ? "Markdown Thing streaming is on" : "Markdown Thing streaming is off", "info");
        return;
      }
      if (action === "off") {
        disable(ctx);
        notifySafely(ctx, "Markdown Thing streaming disabled", "info");
        return;
      }
      if (action !== "on") {
        notifySafely(ctx, "Usage: /markdown-thing [on|off|status]", "warning");
        return;
      }
      enabled = true;
      setStatusSafely(ctx, ctx.ui.theme.fg("accent", "markdown thing"));
      notifySafely(
        ctx,
        ctx.isIdle()
          ? "Markdown Thing will stream the next Pi response"
          : "Markdown Thing will stream the next complete Pi response",
        "info",
      );
    },
  });

  pi.on("agent_start", (_event, ctx) => {
    if (enabled) startActiveStream(ctx);
  });

  pi.on("message_start", (event) => {
    if (event.message.role !== "assistant" || !active) return;
    active.needsSeparator = active.hasText;
  });

  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent.type !== "text_delta" || !active) return;
    if (active.needsSeparator) {
      write("\n\n");
      active.needsSeparator = false;
    }
    write(event.assistantMessageEvent.delta);
    active.hasText = true;
  });

  pi.on("agent_end", () => {
    stopActiveStream();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    disable(ctx);
  });
}
