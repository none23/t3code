import type { UsageProviderKind } from "@t3tools/contracts";

/**
 * Stacking and table order. Codex sits under Claude Code so the larger band
 * reads as the top surface, matching the reference layout.
 */
export const PROVIDER_ORDER: readonly UsageProviderKind[] = ["codex", "claude"];

export const PROVIDER_LABEL: Record<UsageProviderKind, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

/** Claude's brand orange against a neutral white for Codex. */
export const PROVIDER_COLOR: Record<UsageProviderKind, string> = {
  claude: "#d97757",
  codex: "#e6e6e6",
};
