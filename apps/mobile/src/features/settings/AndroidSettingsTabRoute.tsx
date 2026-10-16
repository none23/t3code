import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import { useCallback } from "react";

import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

/** Existing settings and widget links land on the same Android tabs as the dock. */
export function AndroidSettingsTabRoute(props: { readonly tab: "settings" | "usage" }) {
  const { navigateToTab } = useWorkspaceTabs()!;
  const route =
    useRoute<RouteProp<{ SettingsUsage: { tab?: string } | undefined }, "SettingsUsage">>();
  const { tab } = props;
  const usageTab = tab === "usage" ? (route.params?.tab ?? "limits") : undefined;
  useFocusEffect(
    useCallback(() => {
      navigateToTab(tab, usageTab);
    }, [navigateToTab, tab, usageTab]),
  );
  return null;
}
