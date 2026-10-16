import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  BackHandler,
  Keyboard,
  View,
  type LayoutChangeEvent,
  type TextInputInstance,
} from "react-native";

import { CompactBrandTitle } from "../../components/CompactBrandTitle";
import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { MaterialSearchField } from "../../components/MaterialSearchField";
import type { ScreenHeaderSearch } from "../../components/ScreenHeader.types";
import { useMaterialToolbarLayout } from "../../components/useMaterialToolbarLayout";
import { WorkspaceConnectionTitle } from "../home/WorkspaceConnectionTitle";

/** A fixed row keeps the four Android headers aligned regardless of their actions or search. */
export function AndroidWorkspaceHeader(props: {
  readonly title: string;
  readonly titleContent?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly search?: Pick<ScreenHeaderSearch, "value" | "onChangeText" | "placeholder">;
  readonly sidebar?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onOpenEnvironments?: () => void;
}) {
  const navigation = useNavigation();
  const { height, ...headerPadding } = useMaterialToolbarLayout();
  const { search } = props;
  const input = useRef<TextInputInstance>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = search !== undefined && (searchOpen || search.value.length > 0);
  const onSearchChange = search?.onChangeText;
  const closeSearch = useCallback(() => {
    onSearchChange?.("");
    setSearchOpen(false);
    Keyboard.dismiss();
  }, [onSearchChange]);
  useFocusEffect(
    useCallback(() => {
      if (!searching) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        else closeSearch();
        return true;
      });
      return () => subscription.remove();
    }, [searching, closeSearch]),
  );
  return (
    <View
      onLayout={props.onLayout}
      className={props.sidebar ? "absolute inset-x-0 top-0 z-[4] bg-header px-2" : "bg-header px-2"}
      style={headerPadding}
    >
      <View className="flex-row items-center gap-1" style={{ height }}>
        {searching ? (
          <AndroidHeaderIconButton
            accessibilityLabel="Close search"
            icon="arrow.left"
            onPress={closeSearch}
          />
        ) : (
          props.leading
        )}
        {searching ? (
          <MaterialSearchField
            inputRef={input}
            accessibilityLabel={search.placeholder}
            clearAccessibilityLabel="Clear search"
            placeholder={search.placeholder}
            value={search.value}
            onChangeText={search.onChangeText}
          />
        ) : (
          (props.titleContent ?? (
            <View className="min-w-0 flex-1 pl-4">
              <WorkspaceConnectionTitle
                grow
                brand={
                  <CompactBrandTitle
                    allowFontScaling={false}
                    accessibilityLabel={`T3 Code, ${props.title}`}
                  />
                }
                onPress={
                  props.onOpenEnvironments ??
                  (() =>
                    navigation.navigate("SettingsSheet", {
                      screen: "SettingsContent",
                      params: { screen: "SettingsEnvironments" },
                    }))
                }
              />
            </View>
          ))
        )}
        {search && !searching ? (
          <AndroidHeaderIconButton
            accessibilityLabel={search.placeholder}
            icon="magnifyingglass"
            onPress={() => setSearchOpen(true)}
          />
        ) : null}
        {props.trailing}
      </View>
    </View>
  );
}
