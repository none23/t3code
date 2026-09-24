import { Box, Column, DropdownMenu, Row, Host, RNHostView, Text } from "@expo/ui/jetpack-compose";
import {
  clickable,
  defaultMinSize,
  padding,
  size,
  weight,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { View } from "react-native";
import { resolveScaledTextRole } from "../lib/appearancePreferences";

import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
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

/** Native popup positioned at the original trigger, outside virtualized rows. */
export function MaterialMenuPopup(props: MaterialMenuPopupProps) {
  const { appearance, themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const { scale, menuWidth, menuItemHeight } = useAndroidControlSizing();
  const body = resolveScaledTextRole("body", appearance.baseFontSize);
  const caption = resolveScaledTextRole("caption", appearance.baseFontSize);
  const foreground = colors["--color-foreground"];
  const muted = colors["--color-foreground-muted"];
  // A fixed native item height clips wrapped labels; a minimum lets each row grow.
  const itemModifiers = [width(menuWidth), defaultMinSize({ minHeight: menuItemHeight })];
  const itemPadding = padding(16 * scale, 8 * scale, 16 * scale, 8 * scale);
  const items = (
    <>
      {props.parent ? (
        <Row
          verticalAlignment="center"
          horizontalArrangement={{ spacedBy: 12 * scale }}
          modifiers={[...itemModifiers, clickable(props.onBack), itemPadding]}
        >
          <MenuIcon name="arrow.left" />
          <Text color={foreground} style={body} modifiers={[weight(1)]}>
            {props.parent.title}
          </Text>
        </Row>
      ) : props.title ? (
        <Text
          color={muted}
          style={caption}
          modifiers={[padding(16 * scale, 8 * scale, 16 * scale, 8 * scale)]}
        >
          {props.title}
        </Text>
      ) : null}
      {props.actions.map((action, index) => (
        <Row
          key={action.id ?? `${index}-${action.title}`}
          verticalAlignment="center"
          horizontalArrangement={{ spacedBy: 12 * scale }}
          modifiers={[
            ...itemModifiers,
            ...(action.attributes?.disabled ? [] : [clickable(() => props.onPress(action))]),
            itemPadding,
          ]}
        >
          {action.image && isAppSymbolName(action.image) ? (
            <MenuIcon
              name={action.image}
              destructive={action.attributes?.destructive}
              disabled={action.attributes?.disabled}
            />
          ) : null}
          <Column modifiers={[weight(1)]}>
            <Text
              style={body}
              color={
                action.attributes?.disabled
                  ? muted
                  : action.attributes?.destructive
                    ? colors["--color-danger-foreground"]
                    : foreground
              }
            >
              {action.title}
            </Text>
            {action.subtitle ? (
              <Text color={muted} style={caption}>
                {action.subtitle}
              </Text>
            ) : null}
          </Column>
          {(action.subactions?.length ?? 0) > 0 ? (
            <MenuIcon name="chevron.right" disabled={action.attributes?.disabled} />
          ) : action.state === "on" ? (
            <MenuIcon name="checkmark" disabled={action.attributes?.disabled} />
          ) : null}
        </Row>
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
