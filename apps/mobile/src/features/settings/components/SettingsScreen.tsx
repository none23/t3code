import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import type { ScreenHeaderProps } from "../../../components/ScreenHeader.types";
import { ScreenHeader } from "../../../components/ScreenHeader";
import { MaterialScreenContent as SettingsScreenContent } from "../../../components/MaterialScreenContent";
import { AndroidWorkspaceHeader } from "../../workspace/AndroidWorkspaceHeader";

export { SettingsScreenContent };

export function SettingsScreen(
  props: Pick<ScreenHeaderProps, "title" | "actions" | "trailing"> & {
    readonly children: ReactNode;
    /** A native form sheet already owns its rounded outer frame. */
    readonly formSheet?: boolean;
    readonly workspaceRoot?: boolean;
  },
) {
  const navigation = useNavigation();

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {props.workspaceRoot && Platform.OS === "android" ? (
        <AndroidWorkspaceHeader title={props.title} trailing={props.trailing} />
      ) : (
        <ScreenHeader
          title={props.title}
          actions={props.actions}
          trailing={Platform.OS === "android" ? props.trailing : undefined}
          sidebar={false}
          onBack={() => navigation.goBack()}
          hideBottomBorder={!props.formSheet}
        />
      )}
      {props.formSheet ? (
        props.children
      ) : (
        <SettingsScreenContent>{props.children}</SettingsScreenContent>
      )}
    </View>
  );
}
