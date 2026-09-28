import { useAuth } from "@clerk/expo";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { AuthRelayWriteScope, type EnvironmentId } from "@t3tools/contracts";
import { settleAsyncResult, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useRef, useState } from "react";
import { Alert } from "react-native";

import { runtime } from "../../lib/runtime";
import { environmentSession } from "../../state/session";
import { relayEnvironmentDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSavedRemoteConnection } from "../../state/use-remote-environment-registry";
import { ConnectionSheetButton } from "../connection/ConnectionSheetButton";
import { linkEnvironmentToCloud } from "./linkEnvironment";
import { refreshManagedRelayEnvironments } from "./managedRelayState";
import { hasCloudPublicConfig, resolveRelayClerkTokenOptions } from "./publicConfig";

export function EnvironmentCloudSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
}) {
  return hasCloudPublicConfig() ? <ConfiguredEnvironmentCloudSetup {...props} /> : null;
}

function ConfiguredEnvironmentCloudSetup({
  environmentId,
  connected,
}: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
}) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth({ treatPendingAsSignedOut: false });
  const navigation = useNavigation();
  const connection = useSavedRemoteConnection(environmentId);
  const session = useAtomValue(environmentSession.sessionStateAtom(environmentId));
  const refreshEnvironments = useAtomCommand(relayEnvironmentDiscovery.refresh);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function setUp() {
    if (!connection?.bearerToken || !userId || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await settleAsyncResult(() =>
        runtime.runPromiseExit(
          Effect.gen(function* () {
            const token = yield* Effect.tryPromise(() => getToken(resolveRelayClerkTokenOptions()));
            if (!token) return yield* Effect.fail(new Error("Sign in to T3 Connect again."));
            yield* linkEnvironmentToCloud({ connection, clerkToken: token, userId });
          }),
        ),
      );
      // A failed setup can still have created the relay link.
      refreshManagedRelayEnvironments();
      await refreshEnvironments();
      if (AsyncResult.isFailure(result)) {
        const error = squashAtomCommandFailure(result);
        Alert.alert(
          "Could not set up T3 Connect",
          error instanceof Error ? error.message : "Try again from this environment's host.",
        );
        return;
      }
      Alert.alert(
        "T3 Connect ready",
        "This environment is linked. Your device preferences are unchanged.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function requestSetup() {
    if (!isSignedIn) {
      navigation.navigate("SettingsSheet", { screen: "SettingsAuth" });
      return;
    }
    if (AsyncResult.isFailure(session)) {
      Alert.alert("Could not check permissions", "Reconnect this environment and try again.");
      return;
    }
    if (
      !AsyncResult.isSuccess(session) ||
      !session.value.authenticated ||
      !session.value.scopes?.includes(AuthRelayWriteScope)
    ) {
      Alert.alert(
        "Set up T3 Connect on the host",
        "This connection does not have permission to set up T3 Connect. Open Connections settings on the host to link this environment.",
      );
      return;
    }
    Alert.alert(
      "Set up T3 Connect?",
      `Link ${connection?.environmentLabel ?? "this environment"} to your account and enable background updates. New links include remote access; existing links keep their remote access setting. Running setup again restores updates disabled by an older app. Your device preferences will stay the same.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Set up", onPress: () => void setUp() },
      ],
    );
  }

  return connection?.bearerToken ? (
    <ConnectionSheetButton
      icon="cloud"
      label={pending ? "Setting up T3 Connect…" : "Set up T3 Connect"}
      disabled={!connected || !isLoaded || AsyncResult.isInitial(session) || pending}
      onPress={requestSetup}
    />
  ) : null;
}
