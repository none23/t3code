import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("../hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/session")>()),
  usePreparedConnection: () => ({ _tag: "Loading" }),
}));
vi.mock("../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/entities")>()),
  useActiveEnvironmentId: () => EnvironmentId.make("env-github-references"),
  useProjects: () => [],
}));
vi.mock("../editorPreferences", () => ({ useOpenInPreferredEditor: () => vi.fn() }));
vi.mock("~/lib/openPullRequestLink", () => ({ useOpenChangeRequestLink: () => vi.fn() }));

import ChatMarkdown from "./ChatMarkdown";

describe("ChatMarkdown GitHub references", () => {
  it("renders a reference as an atomic inline link beside raw HTML", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown
        cwd="/workspace"
        text="<s>should be fixed separately</s> - Fixed in #123"
        githubRepositoryUrl="https://github.com/pingdotgg/t3code"
        lineBreaks
      />,
    );

    expect(html).toContain('href="https://github.com/pingdotgg/t3code/issues/123"');
    expect(html).not.toContain("<wbr");
    expect(html).not.toContain("google.com/s2/favicons");
    expect(html).not.toContain('data-slot="tooltip-trigger"');
  });
});
