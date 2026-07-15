import { describe, expect, it } from "vitest";
import { imageTargetKind, normalizeImageTarget, resolveImage } from "../src/file/imageResolver";

describe("imageTargetKind", () => {
  it("classifies supported targets", () => {
    expect(imageTargetKind("https://example.com/a.png")).toBe("remote");
    expect(imageTargetKind("data:image/png;base64,AA==")).toBe("data");
    expect(imageTargetKind("images/a.png")).toBe("relative");
    expect(imageTargetKind("<https://example.com/a.png>")).toBe("remote");
  });
  it("normalizes Markdown destination wrappers without changing source", async () => {
    const sourceTarget = "<https://example.com/a\\(1\\).png>";
    expect(normalizeImageTarget(sourceTarget)).toBe("https://example.com/a(1).png");
    expect(await resolveImage(sourceTarget, null)).toBe("https://example.com/a(1).png");
    expect(sourceTarget).toBe("<https://example.com/a\\(1\\).png>");
  });

  it("rejects unsafe schemes and absolute paths", () => {
    expect(imageTargetKind("javascript:alert(1)")).toBe("unsupported");
    expect(imageTargetKind("file:///tmp/a.png")).toBe("unsupported");
    expect(imageTargetKind("/tmp/a.png")).toBe("unsupported");
  });
});
