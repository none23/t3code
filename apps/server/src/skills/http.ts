import { AuthOrchestrationReadScope, EnvironmentHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";

/**
 * Serves `SKILL.md` bodies for skills the provider registry has already
 * discovered. The requested path must exactly match a `skills[].path` on a
 * current provider snapshot — the snapshot acts as the allowlist, so this
 * endpoint cannot be used to read arbitrary files.
 */
export const skillsHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "skills",
  Effect.fnUntraced(function* (handlers) {
    const providerRegistry = yield* ProviderRegistry;
    const fileSystem = yield* FileSystem.FileSystem;

    return handlers.handle(
      "skillFile",
      Effect.fn("environment.skills.skillFile")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        yield* requireEnvironmentScope(AuthOrchestrationReadScope);
        const providers = yield* providerRegistry.getProviders;
        const known = providers.some((provider) =>
          provider.skills.some((skill) => skill.path === args.payload.path),
        );
        if (!known) {
          return yield* failEnvironmentNotFound("skill_not_found");
        }
        // A skill deleted between snapshot and read also lands here.
        const content = yield* fileSystem
          .readFileString(args.payload.path)
          .pipe(Effect.catch(() => failEnvironmentNotFound("skill_not_found")));
        return { content };
      }),
    );
  }),
);
