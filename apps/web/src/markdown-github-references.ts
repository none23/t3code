import { defaultIgnore, findAndReplace, type RegExpMatchObject } from "hast-util-find-and-replace";

interface MarkdownSourceFile {
  value?: unknown;
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
const GITHUB_REFERENCE_IGNORED_ELEMENTS = [...defaultIgnore, "a", "code", "pre"];

export function githubReferenceUrl(repositoryUrl: string, number: string): string {
  return `${repositoryUrl}/issues/${number}`;
}

function referencesInSource(source: string, start: number, end: number): SourceReference[] {
  return [...source.slice(start, end).matchAll(GITHUB_ISSUE_SOURCE_PATTERN)].flatMap((match) => {
    const number = match[3];
    return number === undefined ? [] : [{ number, escaped: (match[2]?.length ?? 0) % 2 === 1 }];
  });
}

function alignedSourceReferences(match: RegExpMatchObject, source: string): SourceReference[] {
  const numbers = [...match.input.matchAll(new RegExp(GITHUB_ISSUE_REFERENCE_PATTERN))].flatMap(
    (reference) => (reference[1] === undefined ? [] : [reference[1]]),
  );

  for (let index = match.stack.length - 1; index >= 0; index -= 1) {
    const position = match.stack[index]?.position;
    const start = position?.start.offset;
    const end = position?.end.offset;
    if (start === undefined || end === undefined) continue;

    const references = referencesInSource(source, start, end);
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

/** Turns same-repository `#123` text into the link GitHub uses for an issue or pull request. */
export function rehypeGithubReferences({ repositoryUrl }: RehypeGithubReferencesOptions) {
  return (tree: Parameters<typeof findAndReplace>[0], file: MarkdownSourceFile) => {
    const source = typeof file.value === "string" ? file.value : "";
    const remainingReferences = new WeakMap<object, SourceReference[]>();

    findAndReplace(
      tree,
      [
        GITHUB_ISSUE_REFERENCE_PATTERN,
        (_value: string, number: string, match: RegExpMatchObject) => {
          const textNode = match.stack.at(-1);
          if (textNode === undefined) return false;
          const references =
            remainingReferences.get(textNode) ?? alignedSourceReferences(match, source);
          remainingReferences.set(textNode, references);
          const sourceReference = references.shift();
          if (sourceReference?.number !== number || sourceReference.escaped) return false;

          return {
            type: "element",
            tagName: "a",
            properties: { href: githubReferenceUrl(repositoryUrl, number) },
            children: [{ type: "text", value: `#${number}` }],
          };
        },
      ],
      { ignore: GITHUB_REFERENCE_IGNORED_ELEMENTS },
    );
  };
}
