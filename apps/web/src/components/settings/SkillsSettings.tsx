import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderDriverKind, ServerProviderSkill } from "@t3tools/contracts";
import { fetchEnvironmentSkillFile } from "@t3tools/client-runtime/state/skill-file";
import * as Option from "effect/Option";
import { CheckIcon, ChevronRightIcon, CopyIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { runtime } from "../../lib/runtime";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { PROVIDER_OPTIONS } from "../../session-logic";
import { type EnvironmentPresentation, useEnvironments } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { usePreparedConnection } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  ConnectionStatusDot,
  connectionPhaseDotClassName,
  connectionPhasePingClassName,
} from "../ConnectionStatusDot";
import { PROVIDER_ICON_BY_PROVIDER } from "../chat/providerIconUtils";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { toastManager } from "../ui/toast";
import {
  formatSkillCount,
  formatSkillPath,
  providerSkillGroups,
  totalSkillCount,
  type ProviderSkillGroup,
} from "./SkillsSettings.logic";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

function labelForDriver(driver: ProviderDriverKind): string | undefined {
  return PROVIDER_OPTIONS.find((option) => option.value === driver)?.label;
}

/** Chevron that points right when collapsed and down when open. */
function DisclosureChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronRightIcon
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
        open && "rotate-90",
        className,
      )}
    />
  );
}

/**
 * Collapsible state that a search forces open: matches must stay visible, and
 * toggling is suspended until the search clears.
 */
function useSearchAwareDisclosure(isSearching: boolean) {
  const [collapsed, setCollapsed] = useState(false);
  const open = isSearching || !collapsed;
  const setOpen = (nextOpen: boolean) => {
    if (!isSearching) setCollapsed(!nextOpen);
  };
  return { open, setOpen };
}

function StatusLine({ children, tone }: { children: string; tone?: "error" }) {
  return (
    <p
      className={cn(
        "py-2 pl-9 pr-3 text-[13px] sm:pr-4",
        tone === "error" ? "text-destructive" : "text-muted-foreground/80",
      )}
    >
      {children}
    </p>
  );
}

export function SkillsSettings() {
  const { environments } = useEnvironments();
  const [query, setQuery] = useState("");
  const refreshServerProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const refreshAll = useCallback(() => {
    for (const environment of environments) {
      void refreshServerProviders({ environmentId: environment.environmentId, input: {} });
    }
  }, [environments, refreshServerProviders]);

  return (
    <SettingsPageContainer>
      <SettingsSection
        id={searchableSetting("skills").id}
        title="Skills"
        icon={<SparklesIcon className="size-4 text-muted-foreground" />}
        headerAction={
          <Button size="xs" variant="ghost" onClick={refreshAll}>
            <RefreshCwIcon className="size-3.5" />
            Refresh all
          </Button>
        }
      >
        <div className="space-y-2.5 px-3 pb-3 sm:px-4">
          <p className="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
            Skills reported by each harness on your connected computers. Paths refer to the computer
            where the skill is installed.
          </p>
          <Input
            type="search"
            nativeInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills, harnesses, or paths"
            aria-label="Search skills"
            className="max-w-sm"
          />
        </div>

        <div className="divide-y divide-border/50 border-t border-border/50">
          {environments.map((environment) => (
            <EnvironmentSkills
              key={environment.environmentId}
              environment={environment}
              query={query}
            />
          ))}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function EnvironmentSkills({
  environment,
  query,
}: {
  environment: EnvironmentPresentation;
  query: string;
}) {
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environment.environmentId));
  const panelId = useId();

  const visibleGroups = useMemo(
    () => providerSkillGroups(providers ?? [], labelForDriver, query),
    [providers, query],
  );
  const total = (providers ?? []).reduce((count, provider) => count + provider.skills.length, 0);
  const phase = environment.connection.phase;
  const isSearching = query.trim().length > 0;
  const { open, setOpen } = useSearchAwareDisclosure(isSearching);

  return (
    <section>
      {/* The status dot is its own tooltip trigger, so it stays a sibling of
          the disclosure button rather than nesting inside it. */}
      <div className="flex min-w-0 items-center gap-2 pr-3 sm:pr-4">
        <h3 className="contents">
          <button
            type="button"
            aria-expanded={open}
            // The panel unmounts while closed, so only reference it when open.
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg py-2 pl-3 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:pl-4"
          >
            <DisclosureChevron open={open} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {environment.label}
            </span>
          </button>
        </h3>
        <ConnectionStatusDot
          tooltipText={phase}
          dotClassName={connectionPhaseDotClassName(phase)}
          pingClassName={connectionPhasePingClassName(phase)}
        />
        {providers !== null ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
            {formatSkillCount(total, isSearching ? totalSkillCount(visibleGroups) : undefined)}
          </span>
        ) : null}
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent id={panelId}>
          <div className="pb-2">
            {providers === null ? (
              <StatusLine>Connect to this computer to inspect its skills.</StatusLine>
            ) : visibleGroups.length === 0 ? (
              <StatusLine>
                {isSearching ? "No skills match this search." : "No skills found."}
              </StatusLine>
            ) : (
              visibleGroups.map((group) => (
                <ProviderSkills
                  key={group.instanceId}
                  environmentId={environment.environmentId}
                  group={group}
                  isSearching={isSearching}
                />
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function ProviderSkills({
  environmentId,
  group,
  isSearching,
}: {
  environmentId: EnvironmentId;
  group: ProviderSkillGroup;
  isSearching: boolean;
}) {
  const panelId = useId();
  const HarnessIcon = PROVIDER_ICON_BY_PROVIDER[group.driver] ?? null;
  const { open, setOpen } = useSearchAwareDisclosure(isSearching);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-7 pr-3 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:pl-8 sm:pr-4"
      >
        <DisclosureChevron open={open} className="size-3" />
        {HarnessIcon ? <HarnessIcon aria-hidden className="size-3.5 shrink-0" /> : null}
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          {group.displayName}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/50">
          {group.skills.length}
        </span>
      </button>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent id={panelId}>
          {group.skills.map((skill) => (
            <SkillRow key={skill.path} environmentId={environmentId} skill={skill} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SkillRow({
  environmentId,
  skill,
}: {
  environmentId: EnvironmentId;
  skill: ServerProviderSkill;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const description = skill.shortDescription ?? skill.description;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:pl-11 sm:pr-4",
          open && "bg-muted/20",
        )}
      >
        <DisclosureChevron open={open} className="size-3" />
        <span
          className={cn(
            "min-w-0 truncate text-[13px] font-medium text-foreground sm:w-44 sm:shrink-0 lg:w-52",
            !skill.enabled && "text-muted-foreground/60 line-through decoration-1",
          )}
        >
          {skill.displayName ?? skill.name}
        </span>
        {description ? (
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground/70">
            {description}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <span className="hidden w-56 shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground/40 lg:block">
          {formatSkillPath(skill.path)}
        </span>
      </button>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent id={panelId}>
          <SkillDetail environmentId={environmentId} skill={skill} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type SkillFileState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly content: string }
  | { readonly status: "error"; readonly message: string };

function skillFileErrorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : "Could not load this SKILL.md file.";
}

function SkillDetail({
  environmentId,
  skill,
}: {
  environmentId: EnvironmentId;
  skill: ServerProviderSkill;
}) {
  const prepared = usePreparedConnection(environmentId);
  const [file, setFile] = useState<SkillFileState>({ status: "loading" });
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "skill path",
    timeout: 1_500,
    onError: () => toastManager.add({ type: "error", title: "Could not copy skill path" }),
  });

  // This card only mounts while its row is expanded, so each expansion
  // fetches the file once.
  useEffect(() => {
    if (Option.isNone(prepared)) return;
    let cancelled = false;
    setFile({ status: "loading" });
    void runtime
      .runPromise(fetchEnvironmentSkillFile({ prepared: prepared.value, path: skill.path }))
      .then((result) => {
        if (!cancelled) setFile({ status: "loaded", content: result.content.trim() });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setFile({ status: "error", message: skillFileErrorMessage(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [prepared, skill.path]);

  return (
    <div className="mx-3 mt-2 mb-5 space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4 sm:ml-11 sm:mr-4 sm:p-5">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">{skill.name}</h4>
        <p className="max-w-3xl text-[13px] leading-6 text-muted-foreground/85">
          {skill.description ?? "This skill has no description."}
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
          Installed at
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-muted-foreground">
            {skill.path}
          </code>
          <Button
            size="xs"
            variant="outline"
            onClick={() => copyToClipboard(skill.path)}
            aria-label={`Copy path for ${skill.name}`}
          >
            {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {isCopied ? "Copied" : "Copy path"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/25 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            SKILL.md
          </span>
          {skill.scope ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground/40">
              {skill.scope}
            </span>
          ) : null}
        </div>
        {Option.isNone(prepared) ? (
          <p className="px-2.5 py-2 text-[12px] text-muted-foreground/70">
            Connect to this computer to read the file.
          </p>
        ) : file.status === "loading" ? (
          <p className="px-2.5 py-2 text-[12px] text-muted-foreground/70">Loading…</p>
        ) : file.status === "error" ? (
          <p className="px-2.5 py-2 text-[12px] text-destructive">{file.message}</p>
        ) : file.content ? (
          <ScrollArea chainVerticalScroll className="max-h-[32rem] w-full rounded-none">
            <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-7 text-muted-foreground/90">
              {file.content}
            </pre>
          </ScrollArea>
        ) : (
          <p className="px-2.5 py-2 text-[12px] text-muted-foreground/70">
            This SKILL.md file is empty.
          </p>
        )}
      </div>
    </div>
  );
}
