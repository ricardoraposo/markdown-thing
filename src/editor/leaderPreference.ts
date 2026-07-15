const STORAGE_KEY = "markdown-thing-vim-leader";
export const DEFAULT_LEADER = "\\";

export function normalizeLeader(value: string | null): string | null {
  if (value === null) return null;
  const characters = Array.from(value);
  if (characters.length !== 1) return null;
  const codePoint = characters[0]!.codePointAt(0)!;
  return codePoint >= 0x20 && codePoint !== 0x7f ? characters[0]! : null;
}

export function loadLeader(): string {
  return normalizeLeader(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_LEADER;
}

export function saveLeader(leader: string): void {
  const normalized = normalizeLeader(leader);
  if (!normalized) throw new Error("The Vim leader must be one printable character");
  localStorage.setItem(STORAGE_KEY, normalized);
}

export function describeLeader(leader: string): string {
  if (leader === " ") return "Space";
  if (leader === "\\") return "Backslash";
  return leader;
}
