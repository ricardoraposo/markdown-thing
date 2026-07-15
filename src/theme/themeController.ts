export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "markdown-thing-theme";

export class ThemeController {
  private preference: ThemePreference;
  private readonly media = matchMedia("(prefers-color-scheme: dark)");
  private listeners = new Set<(theme: ResolvedTheme) => void>();

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    this.preference = stored === "light" || stored === "dark" ? stored : "system";
    this.media.addEventListener("change", this.onSystemChange);
    this.apply();
  }

  get value(): ThemePreference { return this.preference; }
  get resolved(): ResolvedTheme { return this.preference === "system" ? (this.media.matches ? "dark" : "light") : this.preference; }

  set(preference: ThemePreference): void {
    this.preference = preference;
    localStorage.setItem(STORAGE_KEY, preference);
    this.apply();
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    listener(this.resolved);
    return () => this.listeners.delete(listener);
  }

  private readonly onSystemChange = (): void => { if (this.preference === "system") this.apply(); };
  private apply(): void {
    document.documentElement.dataset.theme = this.resolved;
    document.documentElement.style.colorScheme = this.resolved;
    for (const listener of this.listeners) listener(this.resolved);
  }
}
