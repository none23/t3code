import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vite-plus/test";

import { remarkGithubReferences } from "./markdown-github-references";

const REPOSITORY_URL = "https://github.com/pingdotgg/t3code";

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkGithubReferences, { repositoryUrl: REPOSITORY_URL }]]}
    >
      {markdown}
    </ReactMarkdown>,
  );
}

describe("remarkGithubReferences", () => {
  it("links same-repository issue and pull request references", () => {
    const html = renderMarkdown("Fixes #7742 and follows #2554.");

    expect(html).toContain('href="https://github.com/pingdotgg/t3code/issues/7742"');
    expect(html).toContain('href="https://github.com/pingdotgg/t3code/issues/2554"');
  });

  it("leaves references inside links and code alone", () => {
    const html = renderMarkdown("[existing #1](https://example.com) and `#2`\n\n```text\n#3\n```");

    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/`);
  });

  it("does not link a reference embedded in another identifier", () => {
    const html = renderMarkdown("owner/repo#1 C#2 word#3, but (#4) works.");

    expect(html).not.toContain(`${REPOSITORY_URL}/issues/1`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/2`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/3`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/4"`);
  });
});
