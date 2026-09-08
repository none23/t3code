import { LRUCache } from "./lruCache";

export type MermaidTheme = "light" | "dark";

const renderedDiagramCache = new LRUCache<string>(100, 10 * 1024 * 1024);
const pendingDiagrams = new Map<string, Promise<string>>();
let renderQueue = Promise.resolve();
let nextDiagramId = 0;

function diagramCacheKey(source: string, theme: MermaidTheme): string {
  return `${theme}\0${source}`;
}

function sanitizedSvgSize(svg: string, source: string): number {
  return svg.length * 2 + source.length * 2;
}

/** Mermaid has global configuration, so theme-specific renders run serially. */
function enqueueRender(source: string, theme: MermaidTheme): Promise<string> {
  const render = renderQueue.then(async () => {
    const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
      import("mermaid"),
      import("dompurify"),
    ]);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
    });
    const { svg } = await mermaid.render(`t3-mermaid-${nextDiagramId++}`, source);
    return String(
      DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      }),
    );
  });
  renderQueue = render.then(
    () => undefined,
    () => undefined,
  );
  return render;
}

export function renderMermaidDiagram(source: string, theme: MermaidTheme): Promise<string> {
  const key = diagramCacheKey(source, theme);
  const cached = renderedDiagramCache.get(key);
  if (cached !== null) return Promise.resolve(cached);

  const pending = pendingDiagrams.get(key);
  if (pending) return pending;

  const render = enqueueRender(source, theme)
    .then((svg) => {
      renderedDiagramCache.set(key, svg, sanitizedSvgSize(svg, source));
      return svg;
    })
    .finally(() => pendingDiagrams.delete(key));
  pendingDiagrams.set(key, render);
  return render;
}
