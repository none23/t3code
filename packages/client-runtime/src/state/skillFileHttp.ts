import * as Effect from "effect/Effect";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const DEFAULT_SKILL_FILE_TIMEOUT_MS = 10_000;

/**
 * Fetches one `SKILL.md` body from an environment. `path` must come from a
 * provider snapshot's `skills` list — the server rejects paths it has not
 * itself discovered.
 */
export const fetchEnvironmentSkillFile = Effect.fn("clientRuntime.state.fetchEnvironmentSkillFile")(
  function* (input: {
    readonly prepared: PreparedConnection;
    readonly path: string;
    readonly timeoutMs?: number;
  }) {
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(RemoteEnvironmentAuthorization);
    return yield* executeAuthenticatedEnvironmentHttpRequest({
      prepared: input.prepared,
      signer,
      remoteAuthorization,
      method: "GET",
      url: (httpBaseUrl) => environmentEndpointUrl(httpBaseUrl, "/api/skills/file"),
      timeoutMs: input.timeoutMs ?? DEFAULT_SKILL_FILE_TIMEOUT_MS,
      request: ({ client, headers }) =>
        client.skills.skillFile({ payload: { path: input.path }, headers }),
    });
  },
);
