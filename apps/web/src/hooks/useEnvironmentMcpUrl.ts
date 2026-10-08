import {
  environmentMcpUrl,
  type ConnectionCatalogEntry,
  type ConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";

import { useRelayEnvironmentDiscovery } from "../state/environments";

export function useEnvironmentMcpUrl(
  entry: ConnectionCatalogEntry | null,
  connectedTarget?: ConnectionTarget | null,
): string | null {
  const discovery = useRelayEnvironmentDiscovery();
  const [lastDiscovery, setLastDiscovery] = useState(discovery);
  if (!discovery.refreshing && discovery !== lastDiscovery) {
    setLastDiscovery(discovery);
  }
  if (entry === null) return null;
  const environmentId = entry.target.environmentId;
  // Discovery empties its map while refreshing. Keep the public URL during that
  // gap, but drop it when a completed refresh removes the T3 Connect link.
  const relayEnvironment =
    discovery.environments.get(environmentId) ??
    (discovery.refreshing ? lastDiscovery.environments.get(environmentId) : undefined);
  return environmentMcpUrl({
    entry,
    connectedTarget,
    relayHttpBaseUrl: relayEnvironment?.environment.endpoint.httpBaseUrl,
  });
}
