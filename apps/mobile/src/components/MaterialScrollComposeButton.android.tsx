import { Box, Host, Icon } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useCallback, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { MaterialFab } from "./MaterialFab.android";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/** Keep the animated width and icon positioning entirely inside Compose, not Yoga. */
export function MaterialScrollComposeButton(props: {
  readonly expanded: boolean;
  readonly onPress: () => void;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const { scale, iconSize, fabSize } = useAndroidControlSizing();
  const [buttonWidth, setButtonWidth] = useState(fabSize);
  const rememberWidth = useCallback(({ width }: { width: number }) => {
    setButtonWidth(width);
  }, []);
  return (
    <View pointerEvents="box-none" className={props.className} style={[props.style, { left: 20 }]}>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Host
          matchContents={{ vertical: true }}
          colorScheme={themeAppearance}
          ignoreSafeAreaKeyboardInsets
          style={{ width: "100%" }}
        >
          <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
            <MaterialFab
              primary
              label="New thread"
              expanded={props.expanded}
              onSizeChanged={rememberWidth}
            >
              <Icon
                source={require("../../assets/icons/compose.xml")}
                size={iconSize}
                tint={colors["--color-primary-foreground"]}
              />
            </MaterialFab>
          </Box>
        </Host>
      </View>
      {/* The visual host is wider than the button; only this target intercepts list touches. */}
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityLabel="New thread"
        android_ripple={{ foreground: true }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: buttonWidth,
          borderRadius: 16 * scale,
          overflow: "hidden",
        }}
      />
    </View>
  );
}
