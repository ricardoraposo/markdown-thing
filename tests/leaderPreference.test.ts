import { describe, expect, it } from "vitest";
import { describeLeader, normalizeLeader } from "../src/editor/leaderPreference";

describe("Vim leader preference", () => {
  it("accepts one printable character including space", () => {
    expect(normalizeLeader("\\")).toBe("\\");
    expect(normalizeLeader(" ")).toBe(" ");
    expect(normalizeLeader(",")).toBe(",");
  });

  it("rejects empty, multi-key, and control values", () => {
    expect(normalizeLeader("")).toBeNull();
    expect(normalizeLeader("ab")).toBeNull();
    expect(normalizeLeader("\n")).toBeNull();
  });

  it("uses readable labels for invisible or named keys", () => {
    expect(describeLeader(" ")).toBe("Space");
    expect(describeLeader("\\")).toBe("Backslash");
    expect(describeLeader(",")).toBe(",");
  });
});
