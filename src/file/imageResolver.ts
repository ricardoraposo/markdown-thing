import { loadLocalImage } from "./tauriFiles";

export function normalizeImageTarget(target: string): string {
  const unwrapped = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
  return unwrapped.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
}

export function imageTargetKind(target: string): "remote" | "data" | "relative" | "unsupported" {
  const normalized = normalizeImageTarget(target);
  if (/^https:\/\//i.test(normalized)) return "remote";
  if (/^data:image\//i.test(normalized)) return "data";
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("/") || normalized.startsWith("\\")) return "unsupported";
  return "relative";
}

export async function resolveImage(target: string, documentPath: string | null): Promise<string> {
  const normalized = normalizeImageTarget(target);
  const kind = imageTargetKind(normalized);
  if (kind === "remote" || kind === "data") return normalized;
  if (kind === "unsupported") throw new Error("Unsupported image location");
  if (!documentPath) throw new Error("Save or open this document before loading relative images");
  return loadLocalImage(documentPath, normalized);
}
