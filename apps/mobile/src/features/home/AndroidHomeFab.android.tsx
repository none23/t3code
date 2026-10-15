import type { ComponentProps } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialFloatingActionButton } from "../../components/MaterialFloatingActionButton";
import type { AndroidHomeFabLayout as SharedAndroidHomeFabLayout } from "./AndroidHomeFab.shared";
import { useWorkspaceState } from "../../state/workspace";

export function AndroidHomeFabLayout(props: ComponentProps<typeof SharedAndroidHomeFabLayout>) {
  const insets = useSafeAreaInsets();
  const { state } = useWorkspaceState();

  return (
    <View className="flex-1">
      {props.children}
      {!props.disabled && state.hasConnections ? (
        <MaterialFloatingActionButton
          icon="square.and.pencil"
          label="New thread"
          tone="primary"
          onPress={props.onStartNewTask}
          className="absolute"
          style={{
            right: Math.max(insets.right, 20),
            bottom: props.sidebar
              ? Math.max(insets.bottom, 12) + 6
              : Math.max(insets.bottom, 16) + 16,
          }}
        />
      ) : null}
    </View>
  );
}
