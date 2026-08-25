interface MarkdownAstNode {
  type?: string;
  value?: unknown;
  url?: string;
  children?: MarkdownAstNode[];
}

export interface RemarkGithubReferencesOptions {
  /** Repository root URL without a trailing slash. */
  readonly repositoryUrl: string;
}

const GITHUB_ISSUE_REFERENCE_PATTERN = /(^|[^\p{L}\p{N}_/])#([1-9]\d*)(?![\p{L}\p{N}_])/gu;
const REFERENCE_CONTAINER_TYPES = new Set(["link", "linkReference"]);

/** Turns same-repository `#123` text into the link GitHub uses for an issue or pull request. */
export function remarkGithubReferences({ repositoryUrl }: RemarkGithubReferencesOptions) {
  const issueUrlPrefix = `${repositoryUrl}/issues/`;

  return (tree: MarkdownAstNode) => {
    const visit = (node: MarkdownAstNode) => {
      if (REFERENCE_CONTAINER_TYPES.has(node.type ?? "")) return;

      const children = node.children;
      if (children === undefined) return;

      const nextChildren: MarkdownAstNode[] = [];
      for (const child of children) {
        if (child.type !== "text" || typeof child.value !== "string") {
          visit(child);
          nextChildren.push(child);
          continue;
        }

        let cursor = 0;
        for (const match of child.value.matchAll(GITHUB_ISSUE_REFERENCE_PATTERN)) {
          const boundary = match[1] ?? "";
          const number = match[2];
          if (number === undefined || match.index === undefined) continue;

          const referenceStart = match.index + boundary.length;
          if (referenceStart > cursor) {
            nextChildren.push({ type: "text", value: child.value.slice(cursor, referenceStart) });
          }
          nextChildren.push({
            type: "link",
            url: `${issueUrlPrefix}${number}`,
            children: [{ type: "text", value: `#${number}` }],
          });
          cursor = referenceStart + number.length + 1;
        }

        if (cursor === 0) {
          nextChildren.push(child);
        } else if (cursor < child.value.length) {
          nextChildren.push({ type: "text", value: child.value.slice(cursor) });
        }
      }
      node.children = nextChildren;
    };

    visit(tree);
  };
}
