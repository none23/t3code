import * as Effect from "effect/Effect";

import { updateAgentAwarenessRegistrationPreferences } from "./remoteRegistration";

export const setLiveActivityUpdatesEnabled = Effect.fn("setLiveActivityUpdatesEnabled")(
  function* (input: { readonly enabled: boolean; readonly previousEnabled: boolean }) {
    // This is a device preference. Linking environments requires host-admin
    // permissions and changes the account's subscriptions on every device.
    yield* updateAgentAwarenessRegistrationPreferences({
      liveActivitiesEnabled: input.enabled,
    }).pipe(
      Effect.onError(() =>
        updateAgentAwarenessRegistrationPreferences({
          liveActivitiesEnabled: input.previousEnabled,
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Could not restore Live Activity device preference.", cause),
          ),
        ),
      ),
    );
  },
);
