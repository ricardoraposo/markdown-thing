let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

export function loadMermaid(): Promise<typeof import("mermaid").default> {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return mermaidPromise;
}
