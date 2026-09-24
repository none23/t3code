import { describe, expect, it } from "vite-plus/test";

import { resolveAndroidControlSizing } from "./androidControlSizing";
import { MAX_BASE_FONT_SIZE, MIN_BASE_FONT_SIZE } from "./appearancePreferences";

describe("Android control sizing", () => {
  it.each([
    [11, 17, 48, 48, 172, 33],
    [16, 24, 48, 56, 250, 48],
    [22, 33, 66, 77, 344, 66],
  ])(
    "scales controls at %ipt",
    (fontSize, iconSize, buttonSize, fabSize, menuWidth, menuItemHeight) => {
      expect(resolveAndroidControlSizing(fontSize)).toMatchObject({
        iconSize,
        buttonSize,
        fabSize,
        menuWidth,
        menuItemHeight,
      });
    },
  );

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
