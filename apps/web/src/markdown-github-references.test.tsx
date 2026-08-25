import { renderToStaticMarkup } from "react-dom/server";
import rehypeRaw from "rehype-raw";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vite-plus/test";

import { rehypeGithubReferences } from "./markdown-github-references";
import { remarkNormalizeListItemIndentation } from "./markdown-list-indentation";

const REPOSITORY_URL = "https://github.com/owner/repo";

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkNormalizeListItemIndentation]}
      rehypePlugins={[rehypeRaw, [rehypeGithubReferences, { repositoryUrl: REPOSITORY_URL }]]}
    >
      {markdown}
    </ReactMarkdown>,
  );
}

describe("rehypeGithubReferences", () => {
  it("links same-repository issue and pull request references", () => {
    const html = renderMarkdown("Fixes #7742 and follows #2554.");

    expect(html).toContain(`href="${REPOSITORY_URL}/issues/7742"`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/2554"`);
  });

  it.each([
    [
      "a raw HTML link whose label is the reference",
      `See <a href="${REPOSITORY_URL}/issues/123">#123</a>`,
    ],
    [
      "a raw HTML link whose label contains the reference",
      `See <a href="${REPOSITORY_URL}/issues/123">Issue #123</a>`,
    ],
    ["a Markdown link whose label is the reference", `See [#123](${REPOSITORY_URL}/issues/123)`],
    [
      "a Markdown link whose label contains the reference",
      `See [Issue #123](${REPOSITORY_URL}/issues/123)`,
    ],
    ["a reference beside raw HTML", "<s>should be fixed separately</s> - Fixed in #123"],
  ])("renders one link for %s", (_case, markdown) => {
    const html = renderMarkdown(markdown);

    expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/123"`);
  });

  it.each([
    ["Markdown inline code", "Example issue format is `#123`"],
    ["raw HTML code", "Example issue format is <code>#123</code>"],
    ["fenced code", "Example issue format:\n\n```text\n#123\n```"],
  ])("renders no links inside %s", (_case, markdown) => {
    expect(renderMarkdown(markdown).match(/<a\b/g) ?? []).toHaveLength(0);
  });

  it("does not link a reference embedded in another identifier", () => {
    const html = renderMarkdown("owner/repo#1 C#2 word#3, but (#4) works.");

    expect(html).not.toContain(`${REPOSITORY_URL}/issues/1`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/2`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/3`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/4"`);
  });

  it("leaves escaped references as literal text", () => {
    const html = renderMarkdown(String.raw`Keep \#123 literal and word\#5 plain, but link #456.

-       \#789 and #790`);

    expect(html).not.toContain(`${REPOSITORY_URL}/issues/123`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/456"`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/789`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/790"`);
  });
});
