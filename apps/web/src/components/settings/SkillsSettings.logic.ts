import type { ServerProvider, ServerProviderSkill } from "@t3tools/contracts";

const HOME_DIRECTORY_PREFIX = /^(?:\/(?:home|Users)\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[/\\]|$)/;

/** Shortens a skill path for display while preserving its useful tail. */
export function formatSkillPath(path: string): string {
  const homeRelative = path.replace(HOME_DIRECTORY_PREFIX, "~");
  const segments = homeRelative.split(/[/\\]/).filter(Boolean);
  if (segments.length <= 4) return homeRelative;
  return `…/${segments.slice(-3).join("/")}`;
}

/** One provider instance's skills, ready to render as a group. */
export interface ProviderSkillGroup {
  readonly instanceId: ServerProvider["instanceId"];
  readonly driver: ServerProvider["driver"];
  readonly displayName: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
}

function matchesQuery(skill: ServerProviderSkill, displayName: string, query: string): boolean {
  return [skill.name, skill.description ?? "", skill.path, displayName].some((value) =>
    value.toLowerCase().includes(query),
  );
}

/**
 * Projects provider snapshots into skill groups: providers without skills
 * drop out, skills sort by name, and a non-empty query filters skills (a
 * group with no matches disappears).
 */
export function providerSkillGroups(
  providers: ReadonlyArray<ServerProvider>,
  labelForDriver: (driver: ServerProvider["driver"]) => string | undefined,
  query: string,
): ReadonlyArray<ProviderSkillGroup> {
  const normalizedQuery = query.trim().toLowerCase();
  return providers
    .map((provider) => {
      const displayName =
        provider.displayName?.trim() || labelForDriver(provider.driver) || provider.driver;
      const skills = provider.skills
        .filter((skill) => !normalizedQuery || matchesQuery(skill, displayName, normalizedQuery))
        .toSorted((left, right) => left.name.localeCompare(right.name));
      return { instanceId: provider.instanceId, driver: provider.driver, displayName, skills };
    })
    .filter((group) => group.skills.length > 0)
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName));
}

export function totalSkillCount(groups: ReadonlyArray<ProviderSkillGroup>): number {
  return groups.reduce((count, group) => count + group.skills.length, 0);
}

export function formatSkillCount(total: number, visible?: number): string {
  if (visible !== undefined && visible !== total) return `${visible} of ${total} skills`;
  return `${total} ${total === 1 ? "skill" : "skills"}`;
}
