import type {
  ModelSelection,
  ProviderInteractionMode,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  RuntimeMode,
} from "@t3tools/contracts";
import { getProviderOptionCurrentValue } from "@t3tools/shared/model";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { cn } from "../../lib/cn";
import type { ModelOption, ProviderGroup } from "../../lib/modelOptions";
import { applyProviderOptionSelection, providerOptionValueLabels } from "../../lib/providerOptions";
import { useThemeColor } from "../../lib/useThemeColor";

/**
 * The everyday harnesses stay expanded; every other provider (OpenRouter
 * catalogs and friends) folds behind its header so a 300-model catalog can't
 * bury the list.
 */
const PRIMARY_PROVIDER_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);

const RUNTIME_MODE_CHOICES: ReadonlyArray<{
  readonly mode: RuntimeMode;
  readonly label: string;
  readonly shortLabel: string;
}> = [
  { mode: "approval-required", label: "Approve actions", shortLabel: "Approve" },
  { mode: "auto-accept-edits", label: "Auto-accept edits", shortLabel: "Edits" },
  { mode: "auto", label: "Auto", shortLabel: "Auto" },
  { mode: "full-access", label: "Full access", shortLabel: "Full" },
];

/**
 * Compact "Fable 5 · Max · Auto" style summary for the composer trigger pill,
 * covering model, provider options, runtime mode, and plan mode in one label.
 */
export function threadSettingsSummaryLabel(input: {
  readonly modelLabel: string;
  readonly optionDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}): string {
  const runtime = RUNTIME_MODE_CHOICES.find((choice) => choice.mode === input.runtimeMode);
  return [
    input.modelLabel,
    ...providerOptionValueLabels(input.optionDescriptors),
    ...(runtime ? [runtime.shortLabel] : []),
    ...(input.interactionMode === "plan" ? ["Plan"] : []),
  ].join(" · ");
}

function SectionHeader(props: { readonly label: string }) {
  return (
    <Text className="px-5 pb-1.5 pt-4 text-2xs font-t3-bold uppercase tracking-widest text-foreground-muted">
      {props.label}
    </Text>
  );
}

function ModelRow(props: {
  readonly option: ModelOption;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const primaryFg = useThemeColor("--color-primary-foreground");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      // Selected rows get the same primary treatment as the selected chips
      // below. Subtle backgrounds (bg-subtle-strong) get overridden by the
      // OS selection chrome on iOS 26, so use the explicit high-contrast
      // style everywhere instead.
      className={cn(
        "mx-2.5 flex-row items-center gap-2 rounded-xl px-3 py-3.5 active:opacity-70",
        props.selected ? "bg-primary" : "bg-transparent",
      )}
    >
      <Text
        className={cn(
          "shrink text-sm font-t3-medium",
          props.selected ? "text-primary-foreground" : "text-foreground",
        )}
        numberOfLines={1}
      >
        {props.option.label}
      </Text>
      {props.option.isDefault ? (
        <View className="rounded-md bg-subtle-strong px-1.5 py-0.5">
          <Text className="text-3xs font-t3-bold text-foreground-muted">Default</Text>
        </View>
      ) : null}
      {props.option.isLegacy ? (
        <View className="rounded-md bg-subtle px-1.5 py-0.5">
          <Text className="text-3xs font-t3-bold text-foreground-muted">Legacy</Text>
        </View>
      ) : null}
      <View className="flex-1" />
      {props.selected ? (
        <SymbolView name="checkmark" size={14} tintColor={primaryFg} type="monochrome" />
      ) : null}
    </Pressable>
  );
}

/**
 * Provider section header with the harness logo. Secondary providers render
 * as a tappable fold (count + chevron while collapsed); primary providers
 * and the group holding the current selection are static headers.
 */
function ProviderHeader(props: {
  readonly driver: string | undefined;
  readonly label: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly modelCount: number;
  readonly onToggle: () => void;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  return (
    <Pressable
      accessibilityRole={props.collapsible ? "button" : "header"}
      accessibilityState={props.collapsible ? { expanded: !props.collapsed } : undefined}
      accessibilityLabel={
        props.collapsible ? `${props.label}, ${props.modelCount} models` : props.label
      }
      disabled={!props.collapsible}
      onPress={props.onToggle}
      className={cn(
        "mx-2.5 flex-row items-center gap-2 rounded-xl px-3",
        props.collapsible ? "py-3.5 active:opacity-70" : "pb-2 pt-4",
      )}
    >
      <ProviderIcon provider={props.driver} size={15} />
      <Text className="text-2xs font-t3-bold uppercase tracking-widest text-foreground-muted">
        {props.label}
      </Text>
      {props.collapsible ? (
        <>
          <View className="flex-1" />
          {props.collapsed ? (
            <Text className="text-2xs font-t3-medium text-foreground-muted">
              {props.modelCount}
            </Text>
          ) : null}
          <SymbolView
            name={props.collapsed ? "chevron.down" : "chevron.up"}
            size={11}
            tintColor={iconSubtle}
            type="monochrome"
          />
        </>
      ) : null}
    </Pressable>
  );
}

function ChoiceChips<Id extends string>(props: {
  readonly choices: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
  readonly selectedId: Id | undefined;
  readonly onSelect: (id: Id) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5 px-4">
      {props.choices.map((choice) => {
        const selected = choice.id === props.selectedId;
        return (
          <Pressable
            key={choice.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                props.onSelect(choice.id);
              }
            }}
            className={cn(
              "rounded-full border px-3.5 py-2 active:opacity-70",
              selected ? "border-transparent bg-primary" : "border-border bg-subtle",
            )}
          >
            <Text
              className={
                selected
                  ? "text-xs font-t3-bold text-primary-foreground"
                  : "text-xs font-t3-medium text-foreground"
              }
            >
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SwitchRow(props: {
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
}) {
  const activeTrack = String(useThemeColor("--color-switch-active"));
  const track = String(useThemeColor("--color-secondary-border"));
  return (
    <View className="flex-row items-center justify-between px-5 py-2.5">
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      <Switch
        ios_backgroundColor={track}
        onValueChange={props.onValueChange}
        trackColor={{ false: track, true: activeTrack }}
        value={props.value}
      />
    </View>
  );
}

/**
 * Unified thread settings: one bottom sheet holding the provider-grouped
 * model list (primary harnesses expanded, other providers folded, legacy
 * models behind the top-right pill), the selected model's provider options,
 * and runtime mode. Picking a model dismisses the sheet; every other control
 * keeps it open.
 *
 * Rendered through an RN Modal (not the root OverlayPortal) so it also
 * presents above natively-presented form sheets like the new-task draft.
 * Callers must dismiss the keyboard when opening — the iOS keyboard window
 * would otherwise cover the lower half of the sheet.
 */
export function ThreadSettingsSheet(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly selectedModel: ModelSelection | null;
  readonly onSelectModel: (option: ModelOption) => void;
  readonly optionDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly onUpdateOptionSelections: (selections: ReadonlyArray<ProviderOptionSelection>) => void;
  readonly runtimeMode: RuntimeMode;
  readonly onUpdateRuntimeMode: (mode: RuntimeMode) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [showLegacyToggle, setShowLegacyToggle] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<ReadonlySet<string>>(() => new Set());

  // Every open starts from the compact view: legacy hidden, secondary
  // providers folded. The sheet stays mounted between opens, so state would
  // otherwise stick around.
  useEffect(() => {
    if (props.visible) {
      setShowLegacyToggle(false);
      setExpandedProviders(new Set());
    }
  }, [props.visible]);

  const isSelected = (option: ModelOption) =>
    option.selection.instanceId === props.selectedModel?.instanceId &&
    option.selection.model === props.selectedModel.model;

  const hasLegacyModels = props.providerGroups.some((group) =>
    group.models.some((model) => model.isLegacy),
  );
  // A legacy selection forces the toggle on: hiding the current model would
  // strand the checkmark somewhere invisible.
  const selectedIsLegacy = props.providerGroups.some((group) =>
    group.models.some((model) => model.isLegacy && isSelected(model)),
  );
  const showLegacy = showLegacyToggle || selectedIsLegacy;

  const handleSelectModel = (option: ModelOption) => {
    void Haptics.selectionAsync();
    props.onSelectModel(option);
    props.onClose();
  };

  const handleOptionChange = (id: string, value: string | boolean) => {
    const next = applyProviderOptionSelection(props.optionDescriptors, { id, value });
    if (next) {
      props.onUpdateOptionSelections(next);
    }
  };

  const toggleProvider = (providerKey: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (!next.delete(providerKey)) {
        next.add(providerKey);
      }
      return next;
    });
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      visible={props.visible}
      onRequestClose={props.onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel="Close thread settings"
          className="absolute inset-0 bg-backdrop"
          onPress={props.onClose}
        />
        <View
          className="overflow-hidden rounded-t-[24px] border border-b-0 border-border bg-sheet"
          style={{ maxHeight: windowHeight * 0.85 }}
        >
          {/* The grabber doubles as the accessible close control: the dim
              backdrop above a tall sheet is a sliver, and VoiceOver can't
              reach it at all. */}
          <Pressable
            accessibilityLabel="Close thread settings"
            accessibilityRole="button"
            onPress={props.onClose}
            className="items-center pb-1 pt-2.5"
          >
            <View className="h-1 w-9 rounded-full bg-subtle-strong" />
          </Pressable>
          {hasLegacyModels ? (
            <View className="flex-row justify-end px-4 pb-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: showLegacy }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setShowLegacyToggle(!showLegacy);
                }}
                className="rounded-full border border-border bg-subtle px-3 py-1.5 active:opacity-70"
              >
                <Text className="text-2xs font-t3-medium text-foreground-muted">
                  {showLegacy ? "Hide legacy models" : "Show legacy models"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {/* Only the model list scrolls. Provider catalogs can run to hundreds
              of models (OpenRouter), so the settings below stay pinned and
              reachable instead of living at the end of that scroll. */}
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {props.providerGroups.map((group) => {
              const driver = group.models[0]?.providerDriver;
              const isPrimary = driver !== undefined && PRIMARY_PROVIDER_DRIVERS.has(driver);
              const visibleModels = showLegacy
                ? group.models
                : group.models.filter((model) => !model.isLegacy);
              if (visibleModels.length === 0) {
                return null;
              }
              const containsSelection = group.models.some(isSelected);
              const collapsible = !isPrimary && !containsSelection;
              const collapsed = collapsible && !expandedProviders.has(group.providerKey);
              return (
                <View key={group.providerKey}>
                  <ProviderHeader
                    driver={driver}
                    label={group.providerLabel}
                    collapsible={collapsible}
                    collapsed={collapsed}
                    modelCount={visibleModels.length}
                    onToggle={() => toggleProvider(group.providerKey)}
                  />
                  {collapsed
                    ? null
                    : visibleModels.map((option) => (
                        <ModelRow
                          key={option.key}
                          option={option}
                          selected={isSelected(option)}
                          onPress={() => handleSelectModel(option)}
                        />
                      ))}
                </View>
              );
            })}
          </ScrollView>

          <View className="mx-5 h-px bg-border" />

          {/* Normally fits without scrolling, but a model advertising many
              option descriptors could outgrow the sheet; the smaller
              flexShrink keeps the model list absorbing most of the squeeze. */}
          <ScrollView
            style={{ flexShrink: 0.25 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {props.optionDescriptors.map((descriptor) => {
              if (descriptor.type === "select") {
                const currentValue = getProviderOptionCurrentValue(descriptor);
                return (
                  <View key={descriptor.id}>
                    <SectionHeader label={descriptor.label} />
                    <ChoiceChips
                      choices={descriptor.options}
                      selectedId={typeof currentValue === "string" ? currentValue : undefined}
                      onSelect={(id) => handleOptionChange(descriptor.id, id)}
                    />
                  </View>
                );
              }
              return (
                <SwitchRow
                  key={descriptor.id}
                  label={descriptor.label}
                  value={descriptor.currentValue ?? false}
                  onValueChange={(value) => handleOptionChange(descriptor.id, value)}
                />
              );
            })}

            <SectionHeader label="Runtime" />
            <ChoiceChips
              choices={RUNTIME_MODE_CHOICES.map((choice) => ({
                id: choice.mode,
                label: choice.label,
              }))}
              selectedId={props.runtimeMode}
              onSelect={props.onUpdateRuntimeMode}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
