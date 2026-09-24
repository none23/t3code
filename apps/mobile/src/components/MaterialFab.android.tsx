import {
  AnimatedVisibility,
  EnterTransition,
  ExitTransition,
  Row,
  Shape,
  Surface,
  Text,
} from "@expo/ui/jetpack-compose";
import { defaultMinSize, onSizeChanged, padding } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { resolveScaledTextRole } from "../lib/appearancePreferences";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

// Expo shapes are descriptor factories, not rendered children.
const roundedCorner = Shape.RoundedCorner;

/** Compose owns the shape, ripple and label animation; all spacing follows the app text size. */
export function MaterialFab(props: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly expanded?: boolean;
  readonly large?: boolean;
  readonly primary?: boolean;
  readonly onPress?: () => void;
  readonly onSizeChanged?: (size: { width: number; height: number }) => void;
}) {
  const { appearance, themeVariables: colors } = useAppearancePreferences();
  const typography = resolveScaledTextRole("footnote", appearance.baseFontSize);
  const { scale, iconSize, fabSize, largeFabSize } = useAndroidControlSizing();
  const dimension = props.large ? largeFabSize : fabSize;
  const inset = (dimension - (props.large ? Math.round(36 * scale) : iconSize)) / 2;
  const radius = (props.large ? 28 : 16) * scale;

  return (
    <Surface
      color={colors[props.primary ? "--color-primary" : "--color-secondary"]}
      shape={roundedCorner({
        cornerRadii: {
          topStart: radius,
          topEnd: radius,
          bottomStart: radius,
          bottomEnd: radius,
        },
      })}
      shadowElevation={6}
      onClick={props.onPress}
      modifiers={props.onSizeChanged ? [onSizeChanged(props.onSizeChanged)] : undefined}
    >
      <Row
        verticalAlignment="center"
        modifiers={[
          defaultMinSize({ minWidth: dimension, minHeight: dimension }),
          padding(inset, 0, inset, 0),
        ]}
      >
        {props.children}
        {props.label ? (
          <AnimatedVisibility
            visible={props.expanded !== false}
            enterTransition={EnterTransition.fadeIn().plus(EnterTransition.expandHorizontally())}
            exitTransition={ExitTransition.fadeOut().plus(ExitTransition.shrinkHorizontally())}
          >
            <Text
              color={
                colors[
                  props.primary ? "--color-primary-foreground" : "--color-secondary-foreground"
                ]
              }
              style={{ ...typography, fontWeight: "500" }}
              modifiers={[padding(12 * scale, 8 * scale, 4 * scale, 8 * scale)]}
            >
              {props.label}
            </Text>
          </AnimatedVisibility>
        ) : null}
      </Row>
    </Surface>
  );
}
