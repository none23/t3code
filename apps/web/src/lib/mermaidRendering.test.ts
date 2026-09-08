import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  sanitize: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: { initialize: mocks.initialize, render: mocks.render },
}));
vi.mock("dompurify", () => ({
  default: { sanitize: mocks.sanitize },
}));

import { renderMermaidDiagram } from "./mermaidRendering";

describe("renderMermaidDiagram", () => {
  it("renders with strict Mermaid settings and sanitizes the SVG", async () => {
    mocks.render.mockResolvedValueOnce({ svg: "<svg>unsafe</svg>" });
    mocks.sanitize.mockReturnValueOnce("<svg>safe</svg>");

    await expect(renderMermaidDiagram("graph TD; A-->B", "dark")).resolves.toBe("<svg>safe</svg>");

    expect(mocks.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "dark",
    });
    expect(mocks.render.mock.calls[0]?.[0]).toMatch(/^t3-mermaid-\d+$/);
    expect(mocks.render.mock.calls[0]?.[1]).toBe("graph TD; A-->B");
    expect(mocks.sanitize).toHaveBeenCalledWith("<svg>unsafe</svg>", {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
  });
});
