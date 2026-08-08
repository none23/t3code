import { isGhosttyKeyboardCode } from "./keyCodes";

export type TerminalKeyCodeOverrideParseResult =
  | { readonly ok: true; readonly overrides: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly message: string };

export function formatTerminalKeyCodeOverrides(
  overrides: Readonly<Record<string, string>>,
): string {
  return Object.entries(overrides)
    .map(([source, target]) => `${source}=${target}`)
    .join(", ");
}

export function parseTerminalKeyCodeOverrides(value: string): TerminalKeyCodeOverrideParseResult {
  if (value.trim().length === 0) return { ok: true, overrides: {} };

  const overrides: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const separatorIndex = entry.indexOf("=");
    const source = entry.slice(0, separatorIndex).trim();
    const target = entry.slice(separatorIndex + 1).trim();
    if (separatorIndex < 1 || source.length === 0 || target.length === 0) {
      return {
        ok: false,
        message: `“${entry.trim()}” must use the format PhysicalCode=TerminalCode.`,
      };
    }
    if (!isGhosttyKeyboardCode(target)) {
      return { ok: false, message: `“${target}” is not a supported terminal key code.` };
    }
    overrides[source] = target;
  }

  return { ok: true, overrides };
}
