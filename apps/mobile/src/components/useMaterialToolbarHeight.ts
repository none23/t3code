import { useWindowDimensions } from "react-native";

import { useScaledTextRole } from "../features/settings/appearance/useScaledTextRole";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/** Reserve the same title/subtitle space in every pane, including icon-only and search headers. */
export function useMaterialToolbarHeight() {
  const title = useScaledTextRole("title");
  const subtitle = useScaledTextRole("label");
  const { scale } = useAndroidControlSizing();
  const { fontScale } = useWindowDimensions();
  return Math.ceil(
    Math.max(48, 56 * scale, (title.lineHeight + subtitle.lineHeight) * fontScale + 1),
  );
}
