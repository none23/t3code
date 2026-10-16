import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { Platform } from "react-native";

import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

/** Android settings roots are workspace tabs; iOS presents the settings stack. */
export function useSettingsRootNavigation() {
  const navigation = useNavigation();
  const navigateToTab = useWorkspaceTabs()?.navigateToTab;
  return useCallback(
    (tab: "settings" | "usage") => {
      if (Platform.OS === "android" && navigateToTab) {
        navigateToTab(tab);
      } else {
        navigation.navigate("SettingsSheet", {
          screen: "SettingsContent",
          params: { screen: tab === "settings" ? "Settings" : "SettingsUsage" },
        });
      }
    },
    [navigateToTab, navigation],
  );
}
