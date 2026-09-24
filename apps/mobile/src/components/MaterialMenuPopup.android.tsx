import {
  Box,
  Column,
  DropdownMenu,
  Row,
  Surface,
  Host,
  RNHostView,
  Text,
} from "@expo/ui/jetpack-compose";
import { defaultMinSize, padding, size, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import { View } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { useScaledTextRole } from "../features/settings/appearance/useScaledTextRole";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import type { MaterialMenuPopupProps } from "./MaterialMenuPopup";
import { isAppSymbolName, SymbolView, type AppSymbolName } from "./AppSymbol";

function MenuIcon(props: {
  readonly name: AppSymbolName;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}) {
  const { iconSize } = useAndroidControlSizing();
  return (
    <RNHostView matchContents modifiers={[size(iconSize, iconSize)]}>
      <View
        style={{ width: iconSize, height: iconSize }}
        importantForAccessibility="no-hide-descendants"
      >
        <SymbolView
          name={props.name}
          size={iconSize}
          type="monochrome"
          tintColorClassName={
            props.disabled
              ? "accent-icon-subtle"
              : props.destructive
                ? "accent-danger-foreground"
                : "accent-foreground"
          }
        />
      </View>
    </RNHostView>
  );
}

function MenuItem(props: {
  readonly action: MaterialMenuPopupProps["actions"][number];
  readonly onPress: () => void;
}) {
  const { action } = props;
  const { themeVariables: colors } = useAppearancePreferences();
  const { scale, buttonSize, menuWidth } = useAndroidControlSizing();
  const body = useScaledTextRole("body");
  const caption = useScaledTextRole("caption");
  const disabled = Boolean(action.attributes?.disabled);
  const destructive = Boolean(action.attributes?.destructive);
  const trailingIcon =
    (action.subactions?.length ?? 0) > 0
      ? "chevron.right"
      : action.state === "on"
        ? "checkmark"
        : null;

  return (
    <Surface color="transparent" enabled={!disabled} onClick={props.onPress}>
      <Row
        verticalAlignment="center"
        horizontalArrangement={{ spacedBy: 12 * scale }}
        modifiers={[
          width(menuWidth),
          defaultMinSize({ minHeight: buttonSize }),
          padding(16 * scale, 8 * scale, 16 * scale, 8 * scale),
        ]}
      >
        {action.image && isAppSymbolName(action.image) ? (
          <MenuIcon name={action.image} disabled={disabled} destructive={destructive} />
        ) : null}
        <Column modifiers={[weight(1)]}>
          <Text
            style={body}
            color={
              colors[
                disabled
                  ? "--color-foreground-muted"
                  : destructive
                    ? "--color-danger-foreground"
                    : "--color-foreground"
              ]
            }
          >
            {action.title}
          </Text>
          {action.subtitle ? (
            <Text style={caption} color={colors["--color-foreground-muted"]}>
              {action.subtitle}
            </Text>
          ) : null}
        </Column>
        {trailingIcon ? <MenuIcon name={trailingIcon} disabled={disabled} /> : null}
      </Row>
    </Surface>
  );
}

/** Native popup positioned at the original trigger, outside virtualized rows. */
export function MaterialMenuPopup(props: MaterialMenuPopupProps) {
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const { scale, menuWidth } = useAndroidControlSizing();
  const caption = useScaledTextRole("caption");
  const items = (
    <>
      {props.parent ? (
        <MenuItem
          action={{ title: props.parent.title, image: "arrow.left" }}
          onPress={props.onBack}
        />
      ) : props.title ? (
        <Text
          color={colors["--color-foreground-muted"]}
          style={caption}
          modifiers={[padding(16 * scale, 8 * scale, 16 * scale, 8 * scale)]}
        >
          {props.title}
        </Text>
      ) : null}
      {props.actions.map((action, index) => (
        <MenuItem
          key={action.id ?? `${index}-${action.title}`}
          action={action}
          onPress={() => props.onPress(action)}
        />
      ))}
    </>
  );
  if (props.inline) {
    return (
      <Host
        colorScheme={themeAppearance}
        ignoreSafeAreaKeyboardInsets
        matchContents
        style={{ width: menuWidth }}
      >
        <Column>{items}</Column>
      </Host>
    );
  }
  return (
    <Host
      colorScheme={themeAppearance}
      ignoreSafeAreaKeyboardInsets
      style={{
        position: "absolute",
        left: props.anchor.x,
        top: props.anchor.y,
        width: props.anchor.width,
        height: props.anchor.height,
      }}
    >
      <DropdownMenu expanded onDismissRequest={props.onClose} color={colors["--color-card-alt"]}>
        <DropdownMenu.Trigger>
          <Box modifiers={[size(props.anchor.width, props.anchor.height)]} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>{items}</DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
