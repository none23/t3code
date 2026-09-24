import { Box, Host } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { MaterialFab } from "./MaterialFab.android";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { SymbolView, type AppSymbolName } from "./AppSymbol";

export function MaterialFloatingActionButton(props: {
  readonly onPress: () => void;
  readonly label: string;
  readonly icon: AppSymbolName;
  readonly variant?: "extended" | "large";
  readonly expanded?: boolean;
  readonly tone?: "primary" | "secondary";
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const { scale, iconSize: standardIconSize, fabSize } = useAndroidControlSizing();
  const primary = props.tone === "primary";
  const iconSize = props.variant === "large" ? Math.round(36 * scale) : standardIconSize;
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={props.onPress}
      className={props.className}
      style={props.style}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host matchContents colorScheme={themeAppearance} ignoreSafeAreaKeyboardInsets>
          <MaterialFab
            primary={primary}
            large={props.variant === "large"}
            label={props.variant === "extended" ? props.label : undefined}
            expanded={props.expanded}
            onPress={props.onPress}
          >
            <Box modifiers={[size(iconSize, iconSize)]} />
          </MaterialFab>
        </Host>
      </View>
      {/* The RN icon stays outside Compose so it cannot intercept native button taps. */}
      <View
        pointerEvents="none"
        className="absolute inset-y-0 justify-center"
        style={
          props.variant === "extended" && props.expanded !== false
            ? { left: (fabSize - iconSize) / 2 }
            : { left: 0, right: 0, alignItems: "center" }
        }
      >
        <SymbolView
          name={props.icon}
          size={iconSize}
          tintColorClassName={primary ? "accent-primary-foreground" : "accent-secondary-foreground"}
        />
      </View>
    </View>
  );
}
