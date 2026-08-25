import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ChatMarkdown", () => ({
  default: ({ text, githubRepositoryUrl }: { text: string; githubRepositoryUrl?: string }) => (
    <div data-github-repository-url={githubRepositoryUrl}>{text}</div>
  ),
}));

import { PullRequestMarkdown, PullRequestMarkdownRepositoryProvider } from "./PullRequestMarkdown";

function renderPullRequestMarkdown(repositoryUrl: string | null): string {
  return renderToStaticMarkup(
    <PullRequestMarkdownRepositoryProvider repositoryUrl={repositoryUrl}>
      <PullRequestMarkdown text="Fixes #7742" cwd="/workspace" />
    </PullRequestMarkdownRepositoryProvider>,
  );
}

describe("PullRequestMarkdown repository context", () => {
  it("passes the GitHub repository to its Markdown renderer", () => {
    expect(renderPullRequestMarkdown("https://github.com/pingdotgg/t3code")).toContain(
      'data-github-repository-url="https://github.com/pingdotgg/t3code"',
    );
  });

  it("omits the repository when the provider does not supply one", () => {
    expect(renderPullRequestMarkdown(null)).not.toContain("data-github-repository-url");
  });
});
