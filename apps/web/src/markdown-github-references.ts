interface MarkdownHtmlAstNode {
  readonly type: string;
  readonly tagName?: string;
  readonly value?: unknown;
  readonly position?: {
    readonly start?: { readonly offset?: number };
    readonly end?: { readonly offset?: number };
  };
  readonly properties?: Record<string, unknown>;
  children?: MarkdownHtmlAstNode[];
}

interface SourceReference {
  readonly number: string;
  readonly escaped: boolean;
  readonly start: number;
  readonly end: number;
  readonly underscoreSuffixEnd?: number;
}

const GITHUB_ISSUE_REFERENCE_PATTERN = /(?<![\p{L}\p{N}_/])#([1-9]\d*)(?![\p{L}\p{N}_])/gu;
// Even backslash runs after identifiers leave an unescaped `#` in rendered Markdown.
const GITHUB_ISSUE_SOURCE_PATTERN =
  /(^|(?<![\p{L}\p{N}_])_+|[^\p{L}\p{N}_/\\&]|(?<=[\p{L}\p{N}_])(?=(?:\\\\)*#))(?:(\\*)#|(?<!\\)(?:&#(?:0*35|[xX]0*23);|&num;))([1-9]\d*)(?![\p{L}\p{N}/])/gu;
const GITHUB_REFERENCE_IGNORED_ELEMENT_PATTERN = /^(?:a|code|math|pre|script|style|svg|title)$/;

export function githubReferenceUrl(repositoryUrl: string, number: string) {
  return `${repositoryUrl}/issues/${number}`;
}

function sourceReferences(source: string) {
  const references: SourceReference[] = [];
  for (const match of source.matchAll(GITHUB_ISSUE_SOURCE_PATTERN)) {
    const number = match[3];
    if (number === undefined || match.index === undefined) continue;
    const boundary = match[1] ?? "";
    const end = match.index + match[0].length;
    const closingUnderscoreCount = /^_+/u.exec(source.slice(end))?.[0].length ?? 0;
    const openingUnderscoreCount = /^_+$/u.test(boundary) ? boundary.length : 0;
    const underscoreSuffixLength = openingUnderscoreCount
      ? Math.min(openingUnderscoreCount, closingUnderscoreCount)
      : closingUnderscoreCount;

    references.push({
      number,
      escaped: (match[2]?.length ?? 0) % 2 === 1,
      start: match.index + boundary.length,
      end,
      ...(underscoreSuffixLength > 0 ? { underscoreSuffixEnd: end + underscoreSuffixLength } : {}),
    });
  }
  return references;
}

function sourceRange(node: MarkdownHtmlAstNode) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/** Turns same-repository `#123` text into the link GitHub uses for an issue or pull request. */
export function rehypeGithubReferences({ repositoryUrl }: { readonly repositoryUrl: string }) {
  return (tree: MarkdownHtmlAstNode, file: { readonly value?: unknown }) => {
    const source = typeof file.value === "string" ? file.value : "";
    const references = sourceReferences(source);
    const claimed = new Set<SourceReference>();

    function claimSourceReference(
      number: string,
      node: MarkdownHtmlAstNode,
      ancestors: readonly MarkdownHtmlAstNode[],
    ) {
      const stack = [...ancestors, node];
      const isRenderedReference = (reference: SourceReference) =>
        reference.underscoreSuffixEnd === undefined ||
        stack.some((current) => {
          if (current.tagName !== "em" && current.tagName !== "strong") return false;
          return sourceRange(current)?.end === reference.underscoreSuffixEnd;
        });
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const range = sourceRange(stack[index]!);
        if (!range || range.start < 0 || range.end > source.length) continue;

        const parentRange = stack
          .slice(0, index)
          .toReversed()
          .map(sourceRange)
          .find((candidate) => candidate !== undefined);
        if (parentRange && (range.start < parentRange.start || range.end > parentRange.end))
          continue;

        // Footnotes and other transforms can change traversal order, so match by source range
        // instead of advancing a global cursor. PR descriptions normally contain few references.
        const reference = references.find(
          (candidate) =>
            !claimed.has(candidate) &&
            isRenderedReference(candidate) &&
            candidate.number === number &&
            candidate.start >= range.start &&
            candidate.end <= range.end,
        );
        if (reference) {
          claimed.add(reference);
          return reference;
        }
      }
    }

    function replaceReferences(
      text: string,
      node: MarkdownHtmlAstNode,
      ancestors: readonly MarkdownHtmlAstNode[],
      linkable: boolean,
    ) {
      let replacementNodes: MarkdownHtmlAstNode[] | undefined;
      let textStart = 0;

      for (const match of text.matchAll(GITHUB_ISSUE_REFERENCE_PATTERN)) {
        const number = match[1];
        if (number === undefined || match.index === undefined) continue;

        const reference = claimSourceReference(number, node, ancestors);
        if (!linkable || !reference || reference.escaped) continue;

        replacementNodes ??= [];
        if (textStart < match.index) {
          replacementNodes.push({ type: "text", value: text.slice(textStart, match.index) });
        }
        replacementNodes.push({
          type: "element",
          tagName: "a",
          properties: { href: githubReferenceUrl(repositoryUrl, number) },
          children: [{ type: "text", value: `#${number}` }],
        });
        textStart = match.index + match[0].length;
      }

      if (replacementNodes && textStart < text.length) {
        replacementNodes.push({ type: "text", value: text.slice(textStart) });
      }
      return replacementNodes;
    }

    function visit(node: MarkdownHtmlAstNode, ancestors: MarkdownHtmlAstNode[], linkable: boolean) {
      const childLinkable =
        linkable && !GITHUB_REFERENCE_IGNORED_ELEMENT_PATTERN.test(node.tagName ?? "");
      for (const value of Object.values(node.properties ?? {}).flat()) {
        if (typeof value === "string") replaceReferences(value, node, ancestors, false);
      }
      if (!node.children) return;

      ancestors.push(node);
      node.children = node.children.flatMap((child) => {
        if (typeof child.value === "string") {
          return (
            replaceReferences(
              child.value,
              child,
              ancestors,
              childLinkable && child.type === "text",
            ) ?? [child]
          );
        }
        visit(child, ancestors, childLinkable);
        return [child];
      });
      ancestors.pop();
    }

    visit(tree, [], true);
  };
}
