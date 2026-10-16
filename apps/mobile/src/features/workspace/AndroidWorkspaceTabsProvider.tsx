import { useCallback, type ReactNode } from "react";
import { Keyboard, Platform } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { androidWorkspaceNavigationState } from "../../lib/android-workspace-navigation";
import { SettingsEnvironmentFilterProvider } from "../settings/settings-environment-filter";
import { WorkspaceTabsProvider } from "./WorkspaceTabsContext";

/** Android's persistent sidebar and compact root share one tab controller. */
export function AndroidWorkspaceTabsProvider(props: { readonly children: ReactNode }) {
  const navigation = useNavigation();
  const returnToRoot = useCallback(
    (usageTab?: string) => {
      Keyboard.dismiss();
      navigation.dispatch((state) => {
        const root = androidWorkspaceNavigationState(state);
        return CommonActions.reset(
          usageTab === undefined
            ? root
            : {
                ...root,
                routes: root.routes.map((route) => ({ ...route, params: { tab: usageTab } })),
              },
        );
      });
    },
    [navigation],
  );
  return Platform.OS === "android" ? (
    <WorkspaceTabsProvider onNavigateToTab={returnToRoot}>
      <SettingsEnvironmentFilterProvider>{props.children}</SettingsEnvironmentFilterProvider>
    </WorkspaceTabsProvider>
  ) : (
    props.children
  );
}
