const STORAGE_KEY = "markdown-thing-line-numbers";

export function loadLineNumbers(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function saveLineNumbers(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
