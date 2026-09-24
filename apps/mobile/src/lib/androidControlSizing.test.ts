import { describe, expect, it } from "vite-plus/test";

import { resolveAndroidControlSizing } from "./androidControlSizing";
import { MAX_BASE_FONT_SIZE, MIN_BASE_FONT_SIZE } from "./appearancePreferences";

describe("Android control sizing", () => {
  it("keeps the default layout and scales icons and menus with the text", () => {
    const standard = resolveAndroidControlSizing(16);
    const small = resolveAndroidControlSizing(12);
    const large = resolveAndroidControlSizing(20);

    expect(standard).toMatchObject({
      iconSize: 24,
      buttonSize: 48,
      fabSize: 56,
      menuWidth: 250,
      fabClearance: 148,
    });
    expect(small).toMatchObject({ iconSize: 18, buttonSize: 48, fabSize: 48, menuWidth: 188 });
    expect(large).toMatchObject({ iconSize: 30, buttonSize: 60, fabSize: 70, menuWidth: 313 });
  });

  it("keeps buttons tappable and both floating actions clear of the list at every text size", () => {
    for (let fontSize = MIN_BASE_FONT_SIZE; fontSize <= MAX_BASE_FONT_SIZE; fontSize++) {
      const sizing = resolveAndroidControlSizing(fontSize);
      expect(sizing.buttonSize).toBeGreaterThanOrEqual(48);
      expect(sizing.fabSize).toBeGreaterThanOrEqual(48);
      expect(sizing.largeFabSize).toBeGreaterThanOrEqual(48);
      expect(sizing.fabClearance).toBeGreaterThanOrEqual(sizing.fabSize * 2 + 8 + 16);
    }
  });
});
