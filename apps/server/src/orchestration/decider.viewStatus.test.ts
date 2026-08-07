import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const COMPLETED_AT = "2026-08-07T12:00:00.000Z";

function makeReadModel(completedAt: string | null = COMPLETED_AT): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: COMPLETED_AT,
          startedAt: COMPLETED_AT,
          completedAt,
          assistantMessageId: null,
        },
        createdAt: COMPLETED_AT,
        updatedAt: COMPLETED_AT,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        lastViewedAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: COMPLETED_AT,
  };
}

it.layer(NodeServices.layer)("thread view-status decider", (it) => {
  it.effect("uses server-owned timestamps when a thread is viewed", () =>
    Effect.gen(function* () {
      const event = yield* decideOrchestrationCommand({
        command: {
          type: "thread.mark-viewed",
          commandId: CommandId.make("cmd-viewed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(),
      });
      const events = Array.isArray(event) ? event : [event];
      expect(events).toHaveLength(1);
      if (events[0]?.type === "thread.view-status-updated") {
        expect(events[0].payload.lastViewedAt).toBe(COMPLETED_AT);
        expect(Number.isFinite(Date.parse(events[0].payload.lastViewedAt))).toBe(true);
      }
    }),
  );

  it.effect("marks unread immediately before the latest server completion", () =>
    Effect.gen(function* () {
      const event = yield* decideOrchestrationCommand({
        command: {
          type: "thread.mark-unread",
          commandId: CommandId.make("cmd-unread"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(),
      });
      const events = Array.isArray(event) ? event : [event];
      expect(events).toHaveLength(1);
      if (events[0]?.type === "thread.view-status-updated") {
        expect(events[0].payload.lastViewedAt).toBe("2026-08-07T11:59:59.999Z");
      }
    }),
  );

  it.effect("rejects mark-unread before any turn completes", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.mark-unread",
          commandId: CommandId.make("cmd-unread-empty"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
