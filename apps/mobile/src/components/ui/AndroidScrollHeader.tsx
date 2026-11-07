import {
  cloneElement,
  createContext,
  use,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  runOnJS,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useResolveClassNames } from "uniwind";

import {
  useAndroidFloatingTabs,
  useAppearancePreferences,
} from "../../features/settings/appearance/AppearancePreferencesProvider";
import { androidWorkspaceNavigationColors } from "../../features/layout/workspace/android-workspace-navigation-colors";
import { NativeScrollView } from "../../native/NativeScrollViewMarker";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useToolbarLayout } from "./useToolbarLayout";

const AndroidScrollHeaderContext = createContext<{
  readonly scrollY: SharedValue<number>;
  /** Room the list leaves above its content for the status bar and the header. */
  readonly inset: number;
} | null>(null);

/** Set inside a One UI top-level screen: its list scrolls under a header that floats its actions. */
export function useAndroidScrollHeader() {
  return use(AndroidScrollHeaderContext);
}

/** Wraps one top-level screen; its AppBar floats and its list reports its scroll. */
export function AndroidScrollHeaderProvider(props: {
  readonly children: ReactNode;
  readonly enabled?: boolean;
}) {
  const oneUi = useAndroidFloatingTabs();
  const { height, paddingTop, paddingBottom } = useToolbarLayout();
  const scrollY = useSharedValue(0);
  const enabled = oneUi && props.enabled !== false;
  return (
    <AndroidScrollHeaderContext
      value={enabled ? { scrollY, inset: paddingTop + height + paddingBottom } : null}
    >
      {props.children}
    </AndroidScrollHeaderContext>
  );
}

/**
 * One UI's top app bar: the title fades with the first bit of scroll, before content reaches it, and
 * the actions settle into a pill like the floating tabs below while content passes under both.
 */
export function AndroidFloatingHeader(props: {
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  /** Replaces the bar with a fixed, opaque search row. */
  readonly search?: ReactNode;
}) {
  const { scrollY, inset } = useAndroidScrollHeader()!;
  const { height, paddingTop, paddingBottom } = useToolbarLayout();
  const { buttonSize } = useAndroidControlSizing();
  const { themeVariables } = useAppearancePreferences();
  const pillColor = androidWorkspaceNavigationColors(themeVariables, false, true).containerColor;
  const pillHeight = buttonSize + 4;
  // Content first slides under the actions here.
  const threshold = paddingBottom + (height - buttonSize) / 2;
  const floating = useSharedValue(0);
  // Hides the faded title from touch and TalkBack; changes only when the threshold is crossed.
  const [titleHidden, setTitleHidden] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > threshold,
    (next, previous) => {
      if (next === previous) return;
      // A remounted tab starts in its settled state instead of animating into it.
      floating.set(previous === null ? Number(next) : withTiming(next ? 1 : 0, { duration: 150 }));
      runOnJS(setTitleHidden)(next);
    },
  );
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, threshold], [1, 0], Extrapolation.CLAMP),
  }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: floating.value,
    transform: [{ scale: 0.94 + floating.value * 0.06 }],
  }));

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-10"
      style={{ height: inset }}
    >
      <View className="bg-screen" style={{ height: paddingTop }} />
      {props.search ? (
        <View
          className="flex-row items-center gap-1 bg-screen px-1"
          style={{ height: height + paddingBottom }}
        >
          {props.search}
        </View>
      ) : (
        <View pointerEvents="box-none" className="flex-row items-center pr-3" style={{ height }}>
          <Animated.View
            pointerEvents={titleHidden ? "none" : "auto"}
            importantForAccessibility={titleHidden ? "no-hide-descendants" : "auto"}
            className="min-w-0 flex-1 pl-4"
            style={titleStyle}
          >
            {props.title}
          </Animated.View>
          {props.actions ? (
            <View className="flex-row items-center px-1.5">
              <Animated.View
                pointerEvents="none"
                className="absolute inset-x-0 rounded-full"
                style={[
                  {
                    top: (buttonSize - pillHeight) / 2,
                    height: pillHeight,
                    backgroundColor: pillColor,
                    elevation: 3,
                  },
                  pillStyle,
                ]}
              />
              {props.actions}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** The header's ScrollView: reserves the header's room and reports its offset. */
export function AndroidScrollHeaderScrollView(props: ComponentProps<typeof NativeScrollView>) {
  const header = useAndroidScrollHeader()!;
  const animatedRef = useAnimatedRef<ScrollViewInstance>();
  useScrollOffset(animatedRef, header.scrollY);
  const { ref: forwardedRef } = props;
  // The header's room adds to the screen's own top padding, which may come from a class.
  const contentStyle = StyleSheet.flatten([
    useResolveClassNames(props.contentContainerClassName ?? ""),
    props.contentContainerStyle,
  ]);
  const padding =
    contentStyle?.paddingTop ?? contentStyle?.paddingVertical ?? contentStyle?.padding;
  const paddingTop = typeof padding === "number" ? padding : 0;
  return (
    <NativeScrollView
      {...props}
      ref={(instance: ScrollViewInstance | null) => {
        animatedRef(instance);
        if (typeof forwardedRef === "function") forwardedRef(instance);
        else if (forwardedRef) forwardedRef.current = instance;
      }}
      contentContainerStyle={[contentStyle, { paddingTop: header.inset + paddingTop }]}
      refreshControl={
        props.refreshControl
          ? cloneElement(props.refreshControl, { progressViewOffset: header.inset })
          : undefined
      }
    >
      <AndroidScrollHeaderContext value={null}>{props.children}</AndroidScrollHeaderContext>
    </NativeScrollView>
  );
}

/** A list's ref that resets the header when the list unmounts, such as for an empty state. */
export function useAndroidScrollHeaderListRef<T>(listRef: RefObject<T | null>) {
  const scrollY = useAndroidScrollHeader()?.scrollY;
  return (list: T | null) => {
    listRef.current = list;
    if (list === null) scrollY?.set(0);
  };
}
