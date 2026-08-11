/**
 * Detects markdown that the JS renderer draws as a block requiring a definite
 * user-bubble width — fenced code blocks, GFM tables, and ordered lists.
 *
 * Fenced code blocks and tables report an intrinsic width equal to their
 * widest line, which is effectively unbounded. A user bubble sizes itself
 * from its content
 * (`maxWidth` with no `width`), so Android lays the bubble's children out
 * during the unclamped intrinsic pass — where the surrounding paragraphs
 * collapse to a single line — and never repositions them once the width is
 * clamped back to `maxWidth`. The result is siblings drawn on top of each
 * other inside an over-tall bubble. Pinning the bubble's width removes the
 * intrinsic pass entirely, which is the same reason review-comment bubbles
 * already carry an explicit width.
 *
 * Ordered lists hit the same Android layout bug because each item contains a
 * flexing content column inside a shrink-to-fit row.
 *
 * Indented (four-space) code blocks are deliberately not detected: they are
 * vanishingly rare in chat input and the check would fire on ordinary nested
 * list continuations.
 */

const FENCED_CODE_BLOCK = /^ {0,3}(?:```|~~~)/m;
// Trades some precision for a simple check, favoring false positives over false
// negatives: list-shaped paragraph may get a wider bubble
const ORDERED_LIST_ITEM = /^ {0,3}\d{1,9}[.)](?:[ \t]+|$)/m;

function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) {
    return false;
  }
  return /^[|\-: \t]+$/.test(trimmed);
}

export function hasWideMarkdownBlock(text: string): boolean {
  if (FENCED_CODE_BLOCK.test(text) || ORDERED_LIST_ITEM.test(text)) {
    return true;
  }
  if (!text.includes("|")) {
    return false;
  }
  return text.split("\n").some(isTableDelimiterRow);
}
