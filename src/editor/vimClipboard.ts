import { Vim } from "@replit/codemirror-vim";

let configured = false;

function copyYank(text: string, linewise = false): void {
  if (linewise && !text.endsWith("\n")) text += "\n";
  if (!text || !navigator.clipboard?.writeText) return;
  try {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  } catch {
    // Clipboard access can be unavailable outside a user gesture.
  }
}

export function configureClipboardYanks(): void {
  if (configured) return;
  configured = true;
  const registers = Vim.getRegisterController();
  const pushText = registers.pushText.bind(registers);
  registers.pushText = (registerName, operator, text, linewise, blockwise): void => {
    pushText(registerName, operator, text, linewise, blockwise);
    if (operator === "yank" && registerName !== "_" && registerName !== "+") copyYank(text, linewise);
  };
}
