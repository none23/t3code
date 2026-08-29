import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";

import { formatSkillPath, providerSkillGroups } from "./SkillsSettings.logic";

function makeProvider(overrides: {
  instanceId: string;
  driver: string;
  displayName?: string;
  skills: ServerProvider["skills"];
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(overrides.instanceId),
    driver: ProviderDriverKind.make(overrides.driver),
    ...(overrides.displayName ? { displayName: overrides.displayName } : {}),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: "2026-08-29T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: overrides.skills,
  } as ServerProvider;
}

const providers = [
  makeProvider({
    instanceId: "codex",
    driver: "codex",
    skills: [
      {
        name: "review",
        description: "Review changes",
        path: "/home/test/.codex/skills/review/SKILL.md",
        enabled: true,
        scope: "user",
      },
      {
        name: "deploy",
        path: "/home/test/.codex/skills/deploy/SKILL.md",
        enabled: false,
      },
    ],
  }),
  makeProvider({
    instanceId: "claudeAgent",
    driver: "claudeAgent",
    displayName: "Claude",
    skills: [
      {
        name: "unslop",
        description: "Remove AI patterns",
        path: "/home/test/.claude/skills/unslop/SKILL.md",
        enabled: true,
        scope: "user",
      },
    ],
  }),
  makeProvider({ instanceId: "grok", driver: "grok", skills: [] }),
];

const labelForDriver = (driver: string) => ({ codex: "Codex", claudeAgent: "Claude" })[driver];

describe("providerSkillGroups", () => {
  it("drops skill-less providers, sorts groups and skills by name", () => {
    const groups = providerSkillGroups(providers, labelForDriver, "");
    expect(groups.map((group) => group.displayName)).toEqual(["Claude", "Codex"]);
    expect(groups[1]?.skills.map((skill) => skill.name)).toEqual(["deploy", "review"]);
  });

  it("filters skills by name, description, path, and harness, case-insensitively", () => {
    expect(
      providerSkillGroups(providers, labelForDriver, "REVIEW").flatMap((group) =>
        group.skills.map((skill) => skill.name),
      ),
    ).toEqual(["review"]);
    expect(
      providerSkillGroups(providers, labelForDriver, ".claude/").flatMap((group) =>
        group.skills.map((skill) => skill.name),
      ),
    ).toEqual(["unslop"]);
    // A harness match keeps all of that harness's skills.
    expect(
      providerSkillGroups(providers, labelForDriver, "codex").flatMap((group) =>
        group.skills.map((skill) => skill.name),
      ),
    ).toEqual(["deploy", "review"]);
    expect(providerSkillGroups(providers, labelForDriver, "no-such-skill")).toEqual([]);
  });

  it("falls back to the driver slug when no display name or label exists", () => {
    const unlabeled = [
      makeProvider({
        instanceId: "grok",
        driver: "grok",
        skills: [{ name: "solo", path: "/tmp/solo/SKILL.md", enabled: true }],
      }),
    ];
    expect(providerSkillGroups(unlabeled, () => undefined, "")[0]?.displayName).toBe("grok");
  });
});

describe("formatSkillPath", () => {
  it("shortens home-relative paths and keeps short ones intact", () => {
    expect(formatSkillPath("/home/test/.claude/skills/deploy/SKILL.md")).toBe(
      "…/skills/deploy/SKILL.md",
    );
    expect(formatSkillPath("/home/test/.codex/skills")).toBe("~/.codex/skills");
    expect(formatSkillPath("C:\\Users\\test\\.codex\\skills")).toBe("~\\.codex\\skills");
    expect(formatSkillPath("/srv/skills/deploy")).toBe("/srv/skills/deploy");
  });
});
