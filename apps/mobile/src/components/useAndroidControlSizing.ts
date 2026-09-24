import { Platform, useWindowDimensions } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { DEFAULT_BASE_FONT_SIZE } from "../lib/appearancePreferences";
import { resolveAndroidControlSizing } from "../lib/androidControlSizing";

/** Shared layouts keep their existing dimensions on iOS. */
export function useAndroidControlSizing() {
  const { appearance } = useAppearancePreferences();
  const { width } = useWindowDimensions();
  const sizing = resolveAndroidControlSizing(
    Platform.OS === "android" ? appearance.baseFontSize : DEFAULT_BASE_FONT_SIZE,
  );
  return { ...sizing, menuWidth: Math.min(sizing.menuWidth, Math.max(0, width - 24)) };
}
