import * as Effect from "effect/Effect";

import type { PreparedConnection } from "../connection/model.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeEnvironmentHttpRequest, makeEnvironmentHttpApiClient } from "../rpc/http.ts";
import { buildEnvironmentAuthHeaders, withEnvironmentCredentials } from "./environmentHttpAuth.ts";

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
    const requestUrl = environmentEndpointUrl(input.prepared.httpBaseUrl, "/api/skills/file");
    const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const headers = yield* buildEnvironmentAuthHeaders(
      input.prepared.httpAuthorization,
      "GET",
      requestUrl,
      signer,
    );
    return yield* executeEnvironmentHttpRequest(
      requestUrl,
      input.timeoutMs ?? DEFAULT_SKILL_FILE_TIMEOUT_MS,
      withEnvironmentCredentials(
        input.prepared.httpAuthorization,
        client.skills.skillFile({ payload: { path: input.path }, headers }),
      ),
    );
  },
);
