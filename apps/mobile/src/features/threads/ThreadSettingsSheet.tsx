import type {
  ModelSelection,
  ProviderInteractionMode,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  RuntimeMode,
} from "@t3tools/contracts";
import {
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
} from "@t3tools/shared/model";
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

/**
 * Desktop-oriented effort keywords that don't belong in the phone picker.
 * Prompt-injected values (ultrathink and friends) are filtered from the
 * descriptor metadata; ultracode is a real option but a workflow trigger, not
 * a reasoning level. A value set elsewhere still displays, it just isn't
 * offered.
 */
const HIDDEN_EFFORT_OPTION_IDS: ReadonlySet<string> = new Set(["ultracode"]);

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

function selectableChoices(descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>) {
  const injected = new Set(descriptor.promptInjectedValues ?? []);
  return descriptor.options.filter(
    (option) => !injected.has(option.id) && !HIDDEN_EFFORT_OPTION_IDS.has(option.id),
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
      // Selected rows get the same primary treatment as the submenu rows.
      // Subtle backgrounds (bg-subtle-strong) get overridden by the OS
      // selection chrome on iOS 26, so use the explicit high-contrast style
      // everywhere instead.
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

/** Compact row that drills into a single-choice submenu page. */
function DisclosureRow(props: {
  readonly label: string;
  readonly value: string | undefined;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "flex-row items-center gap-2 px-5 py-3 active:opacity-70",
        props.disabled && "opacity-40",
      )}
    >
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      <View className="flex-1" />
      {props.value ? (
        <Text className="text-sm text-foreground-muted" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      <SymbolView name="chevron.right" size={12} tintColor={iconSubtle} type="monochrome" />
    </Pressable>
  );
}

/** Single option inside a submenu page. */
function ChoiceRow(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const primaryFg = useThemeColor("--color-primary-foreground");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      className={cn(
        "mx-2.5 flex-row items-center rounded-xl px-3 py-3.5 active:opacity-70",
        props.selected ? "bg-primary" : "bg-transparent",
      )}
    >
      <Text
        className={cn(
          "shrink text-sm font-t3-medium",
          props.selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {props.label}
      </Text>
      <View className="flex-1" />
      {props.selected ? (
        <SymbolView name="checkmark" size={14} tintColor={primaryFg} type="monochrome" />
      ) : null}
    </Pressable>
  );
}

function SwitchRow(props: {
  readonly label: string;
  readonly value: boolean;
  readonly disabled?: boolean;
  readonly onValueChange: (value: boolean) => void;
}) {
  const activeTrack = String(useThemeColor("--color-switch-active"));
  const track = String(useThemeColor("--color-secondary-border"));
  return (
    <View
      className={cn(
        "flex-row items-center justify-between px-5 py-2.5",
        props.disabled && "opacity-40",
      )}
    >
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      <Switch
        disabled={props.disabled}
        ios_backgroundColor={track}
        onValueChange={props.onValueChange}
        trackColor={{ false: track, true: activeTrack }}
        value={props.value}
      />
    </View>
  );
}

type SheetPage =
  | { readonly kind: "models" }
  | { readonly kind: "descriptor"; readonly id: string }
  | { readonly kind: "runtime" };

/**
 * Unified thread settings: the sheet is the provider-grouped model list
 * (primary harnesses expanded, other providers folded, legacy behind the
 * top-right pill) with a Save button, plus compact disclosure rows that
 * drill into single-choice submenus for reasoning / provider options and
 * runtime mode. Model changes stage until Save; submenu choices apply on
 * tap.
 *
 * Callers control which harnesses are offered via providerGroups: an
 * existing thread must pass only its own provider's group, since a session
 * can't switch harness mid-thread.
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
  const iconColor = useThemeColor("--color-icon");
  const [showLegacyToggle, setShowLegacyToggle] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingModel, setPendingModel] = useState<ModelOption | null>(null);
  const [page, setPage] = useState<SheetPage>({ kind: "models" });

  // Every open starts fresh: model list page, no staged model, legacy
  // hidden, secondary providers folded. The sheet stays mounted between
  // opens, so state would otherwise stick around.
  useEffect(() => {
    if (props.visible) {
      setShowLegacyToggle(false);
      setExpandedProviders(new Set());
      setPendingModel(null);
      setPage({ kind: "models" });
    }
  }, [props.visible]);

  const isApplied = (option: ModelOption) =>
    option.selection.instanceId === props.selectedModel?.instanceId &&
    option.selection.model === props.selectedModel.model;
  // The list highlights the staged pick; Save turns it into the applied one.
  const isDisplayed = (option: ModelOption) =>
    pendingModel ? option.key === pendingModel.key : isApplied(option);
  const hasPendingModelChange = pendingModel !== null && !isApplied(pendingModel);

  const hasLegacyModels = props.providerGroups.some((group) =>
    group.models.some((model) => model.isLegacy),
  );
  // A legacy selection forces the toggle on: hiding the highlighted model
  // would strand the checkmark somewhere invisible.
  const displayedIsLegacy = props.providerGroups.some((group) =>
    group.models.some((model) => model.isLegacy && isDisplayed(model)),
  );
  const showLegacy = showLegacyToggle || displayedIsLegacy;

  const handleSave = () => {
    if (hasPendingModelChange && pendingModel) {
      void Haptics.selectionAsync();
      props.onSelectModel(pendingModel);
    }
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

  const activeDescriptor =
    page.kind === "descriptor"
      ? props.optionDescriptors.find(
          (descriptor) => descriptor.type === "select" && descriptor.id === page.id,
        )
      : undefined;

  const subpage =
    page.kind === "runtime"
      ? {
          title: "Runtime",
          rows: RUNTIME_MODE_CHOICES.map((choice) => ({
            id: choice.mode,
            label: choice.label,
            selected: choice.mode === props.runtimeMode,
            onPress: () => {
              void Haptics.selectionAsync();
              props.onUpdateRuntimeMode(choice.mode);
              setPage({ kind: "models" });
            },
          })),
        }
      : activeDescriptor?.type === "select"
        ? {
            title: activeDescriptor.label,
            rows: selectableChoices(activeDescriptor).map((choice) => ({
              id: choice.id,
              label: choice.label,
              selected: choice.id === getProviderOptionCurrentValue(activeDescriptor),
              onPress: () => {
                void Haptics.selectionAsync();
                handleOptionChange(activeDescriptor.id, choice.id);
                setPage({ kind: "models" });
              },
            })),
          }
        : null;

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

          {subpage ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => setPage({ kind: "models" })}
                className="flex-row items-center gap-1.5 px-4 pb-2 pt-1 active:opacity-70"
              >
                <SymbolView name="chevron.left" size={13} tintColor={iconColor} type="monochrome" />
                <Text className="text-sm font-t3-bold text-foreground">{subpage.title}</Text>
              </Pressable>
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
                showsVerticalScrollIndicator={false}
              >
                {subpage.rows.map((row) => (
                  <ChoiceRow
                    key={row.id}
                    label={row.label}
                    selected={row.selected}
                    onPress={row.onPress}
                  />
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              {hasLegacyModels ? (
                <View className="flex-row justify-end px-4 pb-1.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: showLegacy }}
                    // Forced on while the highlighted model is legacy: hiding
                    // it would strand the checkmark, so don't offer a no-op.
                    disabled={displayedIsLegacy}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setShowLegacyToggle(!showLegacy);
                    }}
                    className={cn(
                      "rounded-full border border-border bg-subtle px-3 py-1.5 active:opacity-70",
                      displayedIsLegacy && "opacity-40",
                    )}
                  >
                    <Text className="text-2xs font-t3-medium text-foreground-muted">
                      {showLegacy ? "Hide legacy models" : "Show legacy models"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {/* Only the model list scrolls. Provider catalogs can run to
                  hundreds of models (OpenRouter), so the rows below stay
                  pinned and reachable instead of living at the end of that
                  scroll. */}
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
                  const containsSelection = group.models.some(isDisplayed);
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
                              selected={isDisplayed(option)}
                              onPress={() => {
                                void Haptics.selectionAsync();
                                setPendingModel(option);
                              }}
                            />
                          ))}
                    </View>
                  );
                })}
              </ScrollView>

              <View className="mx-5 h-px bg-border" />

              {/* Settings rows configure the applied model, so they pause
                  while a different model is staged; Save applies it first. */}
              <View style={{ paddingBottom: insets.bottom + 12 }}>
                {props.optionDescriptors.map((descriptor) =>
                  descriptor.type === "select" ? (
                    <DisclosureRow
                      key={descriptor.id}
                      label={descriptor.label}
                      value={getProviderOptionCurrentLabel(descriptor)}
                      disabled={hasPendingModelChange}
                      onPress={() => setPage({ kind: "descriptor", id: descriptor.id })}
                    />
                  ) : (
                    <SwitchRow
                      key={descriptor.id}
                      label={descriptor.label}
                      value={descriptor.currentValue ?? false}
                      disabled={hasPendingModelChange}
                      onValueChange={(value) => handleOptionChange(descriptor.id, value)}
                    />
                  ),
                )}
                <DisclosureRow
                  label="Runtime"
                  value={
                    RUNTIME_MODE_CHOICES.find((choice) => choice.mode === props.runtimeMode)?.label
                  }
                  disabled={hasPendingModelChange}
                  onPress={() => setPage({ kind: "runtime" })}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSave}
                  className="mx-4 mt-2 h-12 items-center justify-center rounded-full bg-primary active:opacity-80"
                >
                  <Text className="text-sm font-t3-bold text-primary-foreground">
                    {hasPendingModelChange ? "Save" : "Done"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
