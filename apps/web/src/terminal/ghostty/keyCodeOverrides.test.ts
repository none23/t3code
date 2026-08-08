import { describe, expect, it } from "vite-plus/test";

import { formatTerminalKeyCodeOverrides, parseTerminalKeyCodeOverrides } from "./keyCodeOverrides";

describe("terminal key code overrides", () => {
  it("parses and formats physical-to-terminal mappings", () => {
    const parsed = parseTerminalKeyCodeOverrides("CapsLock=Escape, Escape=Unidentified");

    expect(parsed).toEqual({
      ok: true,
      overrides: { CapsLock: "Escape", Escape: "Unidentified" },
    });
    if (parsed.ok) {
      expect(formatTerminalKeyCodeOverrides(parsed.overrides)).toBe(
        "CapsLock=Escape, Escape=Unidentified",
      );
    }
  });

  it("rejects malformed and unsupported targets", () => {
    expect(parseTerminalKeyCodeOverrides("CapsLock").ok).toBe(false);
    expect(parseTerminalKeyCodeOverrides("CapsLock=DefinitelyNotAKey").ok).toBe(false);
  });
});
