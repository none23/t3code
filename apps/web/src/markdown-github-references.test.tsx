import { renderToStaticMarkup } from "react-dom/server";
import rehypeRaw from "rehype-raw";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vite-plus/test";

import { rehypeGithubReferences } from "./markdown-github-references";
import { remarkNormalizeListItemIndentation } from "./markdown-list-indentation";

const REPOSITORY_URL = "https://github.com/owner/repo";

function renderMarkdown(markdown: string) {
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
    ["a reference in emphasis", "_#123_"],
    ["a reference in strong emphasis", "**#123**"],
    ["a reference in underscore-delimited strong emphasis", "__#123__"],
    ["a reference in nested underscore emphasis", "___#123___"],
    ["a reference with an unmatched trailing underscore", "__#123___"],
    ["a reference at the end of emphasis", "_Fixes #123_"],
    ["a reference at the end of strong emphasis", "__Fixes #123__"],
    ["a reference in strikethrough", "~#123~"],
    [
      "a reference before escaped underscores",
      String.raw`Fixes #123 with a \_literal\_ underscore`,
    ],
    [
      "a reference after inline code in an over-indented list item",
      "-       `\\#123` padding text #123",
    ],
    [
      "a reference after the same escaped reference in an HTML attribute",
      String.raw`See <span title="\#123">#123</span>`,
    ],
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

  it.each([
    [
      "an unused link definition",
      String.raw`[unused]: #123

\#123 and #123`,
      "#123 and ",
    ],
    [
      "a reordered footnote definition",
      String.raw`[^1]: \#123

#123 body[^1]`,
      "<p>",
    ],
  ])("keeps escapes aligned with %s", (_case, markdown, beforeLink) => {
    const html = renderMarkdown(markdown);
    const link = `<a href="${REPOSITORY_URL}/issues/123">#123</a>`;

    expect(html.match(new RegExp(`${REPOSITORY_URL}/issues/123`, "g")) ?? []).toHaveLength(1);
    expect(html).toContain(`${beforeLink}${link}`);
  });

  it.each([
    ["a Markdown escape", String.raw`Keep \#123 literal but link #456.`],
    ["an HTML entity", "Use &amp; then link #456."],
  ])("links references after %s in a single paragraph", (_case, markdown) => {
    const html = renderMarkdown(markdown);

    expect(html).toContain(`href="${REPOSITORY_URL}/issues/456"`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/123`);
  });

  it("links repeated references around HTML entities", () => {
    const html = renderMarkdown("Fixes #123 &nbsp; ok, Fixes #123 (see &copy; 2024)");

    expect(html.match(new RegExp(`${REPOSITORY_URL}/issues/123`, "g")) ?? []).toHaveLength(2);
  });

  it("links each reference across an emphasized span", () => {
    const html = renderMarkdown("__#123 and #456__");

    expect(html).toContain(`href="${REPOSITORY_URL}/issues/123"`);
    expect(html).toContain(`href="${REPOSITORY_URL}/issues/456"`);
  });

  it("does not let an escaped identifier consume a later reference with the same number", () => {
    const html = renderMarkdown(String.raw`word_\#5 and \#5_word, but #5 works.`);

    expect(html.match(new RegExp(`${REPOSITORY_URL}/issues/5`, "g")) ?? []).toHaveLength(1);
  });

  it("links an unescaped reference after a literal backslash", () => {
    const html = renderMarkdown(String.raw`text\\#5`);

    expect(html).toContain(`text\\<a href="${REPOSITORY_URL}/issues/5">#5</a>`);
  });

  it("does not link a reference embedded in another identifier", () => {
    const html = renderMarkdown("owner/repo#1 C#2 word#3 word_#5, but (#4) works.");

    expect(html).not.toContain(`${REPOSITORY_URL}/issues/1`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/2`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/3`);
    expect(html).not.toContain(`${REPOSITORY_URL}/issues/5`);
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

  it("keeps escapes aligned in reparsed over-indented list items", () => {
    const html = renderMarkdown(String.raw`#789 and #790

-       \#789 and #790`);

    expect(html.match(new RegExp(`${REPOSITORY_URL}/issues/789`, "g")) ?? []).toHaveLength(1);
    expect(html.match(new RegExp(`${REPOSITORY_URL}/issues/790`, "g")) ?? []).toHaveLength(2);
  });
});
