import { renderToStaticMarkup } from "react-dom/server";
import type { Options as ReactMarkdownOptions } from "react-markdown";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ChatMarkdown", async () => {
  const { default: ReactMarkdown } = await import("react-markdown");
  return {
    default: ({
      text,
      additionalRemarkPlugins,
    }: {
      text: string;
      additionalRemarkPlugins?: ReactMarkdownOptions["remarkPlugins"];
    }) => <ReactMarkdown remarkPlugins={additionalRemarkPlugins}>{text}</ReactMarkdown>,
  };
});

import { PullRequestMarkdown, PullRequestMarkdownRepositoryProvider } from "./PullRequestMarkdown";

function renderPullRequestMarkdown(repositoryUrl: string | null): string {
  return renderToStaticMarkup(
    <PullRequestMarkdownRepositoryProvider repositoryUrl={repositoryUrl}>
      <PullRequestMarkdown text="Fixes #7742" cwd="/workspace" />
    </PullRequestMarkdownRepositoryProvider>,
  );
}

describe("PullRequestMarkdown GitHub references", () => {
  it("links a reference when the pull request supplies a GitHub repository", () => {
    expect(renderPullRequestMarkdown("https://github.com/pingdotgg/t3code")).toContain(
      'href="https://github.com/pingdotgg/t3code/issues/7742"',
    );
  });

  it("leaves a reference alone without GitHub repository context", () => {
    expect(renderPullRequestMarkdown(null)).not.toContain("href=");
  });
});
