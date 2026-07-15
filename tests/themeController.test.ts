// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeController } from "../src/theme/themeController";

const values = new Map<string, string>();
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;
const addEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
  mediaListener = listener;
});
const removeEventListener = vi.fn();
const media = {
  matches: false,
  addEventListener,
  removeEventListener,
} as unknown as MediaQueryList;

beforeEach(() => {
  values.clear();
  mediaListener = undefined;
  addEventListener.mockClear();
  removeEventListener.mockClear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("ThemeController", () => {
  it("persists preferences and notifies system-theme changes", () => {
    const controller = new ThemeController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(controller.value).toBe("system");
    expect(controller.resolved).toBe("light");
    expect(listener).toHaveBeenLastCalledWith("light");
    Object.defineProperty(media, "matches", { configurable: true, value: true });
    mediaListener?.({} as MediaQueryListEvent);
    expect(listener).toHaveBeenLastCalledWith("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    controller.set("light");
    expect(values.get("markdown-thing-theme")).toBe("light");
    expect(controller.resolved).toBe("light");
    unsubscribe();
    controller.set("dark");
    expect(listener).toHaveBeenCalledTimes(3);
    controller.destroy();
  });

  it("removes its media-query listener on destroy", () => {
    const controller = new ThemeController();
    const installed = mediaListener;
    controller.destroy();
    expect(removeEventListener).toHaveBeenCalledWith("change", installed);
  });
});
