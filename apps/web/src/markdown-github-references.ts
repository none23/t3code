interface MarkdownSourceFile {
  value?: unknown;
}

interface MarkdownHtmlPosition {
  readonly start?: { readonly offset?: number };
  readonly end?: { readonly offset?: number };
}

interface MarkdownHtmlAstNode {
  readonly type: string;
  readonly tagName?: string;
  readonly value?: unknown;
  readonly position?: MarkdownHtmlPosition;
  readonly properties?: Record<string, unknown>;
  children?: MarkdownHtmlAstNode[];
}

interface SourceReference {
  readonly number: string;
  readonly escaped: boolean;
}

export interface RehypeGithubReferencesOptions {
  /** Repository root URL without a trailing slash. */
  readonly repositoryUrl: string;
}

const GITHUB_ISSUE_REFERENCE_PATTERN = /(?<![\p{L}\p{N}_/])#([1-9]\d*)(?![\p{L}\p{N}_])/gu;
const GITHUB_ISSUE_SOURCE_PATTERN =
  /(^|[^\p{L}\p{N}_/\\])(?:(\\*)#|(?<!\\)(?:&#(?:0*35|[xX]0*23);|&num;))([1-9]\d*)(?![\p{L}\p{N}_])/gu;
const GITHUB_REFERENCE_IGNORED_ELEMENTS = new Set([
  "a",
  "code",
  "math",
  "pre",
  "script",
  "style",
  "svg",
  "title",
]);

export function githubReferenceUrl(repositoryUrl: string, number: string): string {
  return `${repositoryUrl}/issues/${number}`;
}

function referencesInSource(source: string, start: number, end: number): SourceReference[] {
  return [...source.slice(start, end).matchAll(GITHUB_ISSUE_SOURCE_PATTERN)].flatMap((match) => {
    const number = match[3];
    return number === undefined ? [] : [{ number, escaped: (match[2]?.length ?? 0) % 2 === 1 }];
  });
}

function sourceRange(node: MarkdownHtmlAstNode): { start: number; end: number } | undefined {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  return start === undefined || end === undefined ? undefined : { start, end };
}

function alignedSourceReferences(
  node: MarkdownHtmlAstNode,
  ancestors: readonly MarkdownHtmlAstNode[],
  source: string,
): SourceReference[] {
  if (typeof node.value !== "string") return [];
  const numbers = [...node.value.matchAll(GITHUB_ISSUE_REFERENCE_PATTERN)].flatMap((reference) =>
    reference[1] === undefined ? [] : [reference[1]],
  );
  const stack = [...ancestors, node];

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const current = stack[index];
    const range = current ? sourceRange(current) : undefined;
    if (!range) continue;

    const parentRange = stack
      .slice(0, index)
      .toReversed()
      .map(sourceRange)
      .find((position) => position !== undefined);
    // Reparsed list items can retain synthetic child offsets. Fall back to the first node whose
    // range still belongs to its positioned parent instead of reading unrelated source text.
    if (parentRange && (range.start < parentRange.start || range.end > parentRange.end)) continue;

    const references = referencesInSource(source, range.start, range.end);
    for (let offset = 0; offset <= references.length - numbers.length; offset += 1) {
      const candidate = references.slice(offset, offset + numbers.length);
      if (
        candidate.every((reference, referenceIndex) => reference.number === numbers[referenceIndex])
      ) {
        return candidate;
      }
    }
  }

  return [];
}

function replaceReferencesInText(
  node: MarkdownHtmlAstNode,
  ancestors: readonly MarkdownHtmlAstNode[],
  source: string,
  repositoryUrl: string,
): MarkdownHtmlAstNode[] {
  if (typeof node.value !== "string") return [node];

  const references = alignedSourceReferences(node, ancestors, source);
  const replacementNodes: MarkdownHtmlAstNode[] = [];
  let referenceIndex = 0;
  let textStart = 0;

  for (const match of node.value.matchAll(GITHUB_ISSUE_REFERENCE_PATTERN)) {
    const number = match[1];
    const sourceReference = references[referenceIndex];
    referenceIndex += 1;
    if (
      number === undefined ||
      sourceReference?.number !== number ||
      sourceReference.escaped ||
      match.index === undefined
    ) {
      continue;
    }

    if (textStart < match.index) {
      replacementNodes.push({ type: "text", value: node.value.slice(textStart, match.index) });
    }
    replacementNodes.push({
      type: "element",
      tagName: "a",
      properties: { href: githubReferenceUrl(repositoryUrl, number) },
      children: [{ type: "text", value: `#${number}` }],
    });
    textStart = match.index + match[0].length;
  }

  if (textStart === 0) return [node];
  if (textStart < node.value.length) {
    replacementNodes.push({ type: "text", value: node.value.slice(textStart) });
  }
  return replacementNodes;
}

function replaceGithubReferences(
  node: MarkdownHtmlAstNode,
  ancestors: MarkdownHtmlAstNode[],
  source: string,
  repositoryUrl: string,
): void {
  if (
    node.type === "element" &&
    node.tagName !== undefined &&
    GITHUB_REFERENCE_IGNORED_ELEMENTS.has(node.tagName)
  ) {
    return;
  }
  if (!node.children) return;

  ancestors.push(node);
  node.children = node.children.flatMap((child) => {
    if (child.type === "text") {
      return replaceReferencesInText(child, ancestors, source, repositoryUrl);
    }
    replaceGithubReferences(child, ancestors, source, repositoryUrl);
    return [child];
  });
  ancestors.pop();
}

/** Turns same-repository `#123` text into the link GitHub uses for an issue or pull request. */
export function rehypeGithubReferences({ repositoryUrl }: RehypeGithubReferencesOptions) {
  return (tree: MarkdownHtmlAstNode, file: MarkdownSourceFile) => {
    const source = typeof file.value === "string" ? file.value : "";
    replaceGithubReferences(tree, [], source, repositoryUrl);
  };
}
