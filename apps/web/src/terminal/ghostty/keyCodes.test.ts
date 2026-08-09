import { describe, expect, it } from "vite-plus/test";

import { ghosttyKeyForCode, ghosttyUnshiftedCodepoint, terminalKeyCodeForEvent } from "./keyCodes";

describe("ghosttyKeyForCode", () => {
  it("keeps the tail of the pinned Ghostty key enum in order", () => {
    expect(ghosttyKeyForCode("F25")).toBe(ghosttyKeyForCode("F24") + 1);
    expect(ghosttyKeyForCode("PrintScreen")).toBe(ghosttyKeyForCode("FnLock") + 1);
    expect(ghosttyKeyForCode("Pause")).toBe(ghosttyKeyForCode("ScrollLock") + 1);
    expect(ghosttyKeyForCode("Paste")).toBe(ghosttyKeyForCode("Cut") + 1);
  });

  it("can interpret remapped logical keys without changing the physical-key default", () => {
    const remappedCapsLock = { code: "CapsLock", key: "Escape", location: 0 };

    expect(terminalKeyCodeForEvent(remappedCapsLock, "physical")).toBe("CapsLock");
    expect(terminalKeyCodeForEvent(remappedCapsLock, "logical")).toBe("Escape");
  });

  it("translates unambiguous logical keys and preserves location-dependent keys", () => {
    expect(terminalKeyCodeForEvent({ code: "KeyQ", key: "a", location: 0 }, "logical")).toBe(
      "KeyA",
    );
    expect(terminalKeyCodeForEvent({ code: "Digit8", key: "!", location: 0 }, "logical")).toBe(
      "Digit8",
    );
    expect(terminalKeyCodeForEvent({ code: "Numpad1", key: "1", location: 3 }, "logical")).toBe(
      "Numpad1",
    );
    expect(terminalKeyCodeForEvent({ code: "AltLeft", key: "Alt", location: 1 }, "logical")).toBe(
      "AltLeft",
    );
  });
});

describe("ghosttyUnshiftedCodepoint", () => {
  it("provides the logical base character for Kitty keyboard encoding", () => {
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "c", shiftKey: false })).toBe(
      "c".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "C", shiftKey: true })).toBe(
      "c".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "!", shiftKey: true })).toBe(
      "1".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Slash", key: "?", shiftKey: true })).toBe(
      "/".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "&", shiftKey: false })).toBe(
      "&".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Enter", key: "Enter", shiftKey: false })).toBe(0);
  });

  it("reports unknown instead of the shifted character without layout data", () => {
    expect(ghosttyUnshiftedCodepoint({ code: "Digit7", key: "/", shiftKey: true })).toBe(0);
    expect(ghosttyUnshiftedCodepoint({ code: "KeyD", key: "Д", shiftKey: true })).toBe(
      "д".codePointAt(0),
    );
  });

  it("prefers the active browser layout over US physical key positions", () => {
    const layoutMap = new Map([
      ["Digit1", "&"],
      ["KeyC", "j"],
    ]);
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "1", shiftKey: true }, layoutMap)).toBe(
      "&".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "J", shiftKey: true }, layoutMap)).toBe(
      "j".codePointAt(0),
    );
  });
});
