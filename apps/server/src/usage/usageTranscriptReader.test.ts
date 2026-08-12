// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "@effect/vitest";

import { readTranscriptRecords } from "./usageTranscriptReader.ts";

it("attributes leading Codex usage to the first applied service tier", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-usage-reader-"));
  const transcript = NodePath.join(directory, "rollout.jsonl");

  try {
    await NodeFSP.writeFile(
      transcript,
      [
        {
          type: "turn_context",
          timestamp: "2026-08-12T07:48:20.643Z",
          payload: { type: "turn_context", model: "gpt-5.6-sol" },
        },
        {
          type: "event_msg",
          timestamp: "2026-08-12T07:48:23.760Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 10,
              },
            },
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-08-12T07:51:54.781Z",
          payload: {
            type: "thread_settings_applied",
            thread_settings: { service_tier: "priority" },
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n"),
    );

    const records = await readTranscriptRecords(transcript, "codex");

    expect(records).toHaveLength(1);
    expect(records?.[0]?.speed).toBe("fast");
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
