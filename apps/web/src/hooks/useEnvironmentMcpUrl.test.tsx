import {
  PrimaryConnectionTarget,
  RelayConnectionTarget,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import { Discovery } from "@t3tools/client-runtime/relay";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useEnvironmentMcpUrl } from "./useEnvironmentMcpUrl";

vi.mock("../state/environments", () => ({
  useRelayEnvironmentDiscovery: () => discovery,
}));

const environmentId = EnvironmentId.make("local-environment");
const primaryEntry: ConnectionCatalogEntry = {
  target: new PrimaryConnectionTarget({
    environmentId,
    label: "Local environment",
    httpBaseUrl: "http://localhost:3773",
    wsBaseUrl: "ws://localhost:3773",
  }),
  profile: Option.none(),
  enabled: true,
};
const linkedDiscovery: Discovery.RelayEnvironmentDiscoveryState = {
  ...Discovery.EMPTY_RELAY_ENVIRONMENT_DISCOVERY_STATE,
  environments: new Map([
    [
      environmentId,
      {
        environment: {
          environmentId,
          label: "Local environment",
          endpoint: {
            httpBaseUrl: "https://connect.example.test",
            wsBaseUrl: "wss://connect.example.test",
            providerKind: "cloudflare_tunnel",
          },
          linkedAt: "2026-10-08T00:00:00Z",
        },
        availability: "online",
        status: Option.none(),
        error: Option.none(),
      },
    ],
  ]),
};

let discovery = linkedDiscovery;
let renderer: ReactTestRenderer | undefined;
let mcpUrl: string | null;

function Probe({ entry }: { entry: ConnectionCatalogEntry | null }) {
  const url = useEnvironmentMcpUrl(entry);
  useLayoutEffect(() => {
    mcpUrl = url;
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  discovery = linkedDiscovery;
  mcpUrl = null;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it.each([
  { entry: primaryEntry, fallback: "http://localhost:3773/mcp" },
  {
    entry: {
      ...primaryEntry,
      target: new RelayConnectionTarget({ environmentId, label: "Saved environment" }),
    },
    fallback: null,
  },
])(
  "keeps the public URL during refresh and drops a removed link: $entry.target._tag",
  ({ entry, fallback }) => {
    act(() => {
      renderer = create(<Probe entry={entry} />);
    });
    expect(mcpUrl).toBe("https://connect.example.test/mcp");

    discovery = { ...Discovery.EMPTY_RELAY_ENVIRONMENT_DISCOVERY_STATE, refreshing: true };
    act(() => renderer?.update(<Probe entry={entry} />));
    expect(mcpUrl).toBe("https://connect.example.test/mcp");

    discovery = Discovery.EMPTY_RELAY_ENVIRONMENT_DISCOVERY_STATE;
    act(() => renderer?.update(<Probe entry={entry} />));
    expect(mcpUrl).toBe(fallback);
  },
);

it("does not reuse another environment's public URL during refresh", () => {
  act(() => {
    renderer = create(<Probe entry={primaryEntry} />);
  });
  expect(mcpUrl).toBe("https://connect.example.test/mcp");

  discovery = { ...Discovery.EMPTY_RELAY_ENVIRONMENT_DISCOVERY_STATE, refreshing: true };
  const otherEntry: ConnectionCatalogEntry = {
    ...primaryEntry,
    target: new RelayConnectionTarget({
      environmentId: EnvironmentId.make("other-environment"),
      label: "Other environment",
    }),
  };
  act(() => renderer?.update(<Probe entry={otherEntry} />));
  expect(mcpUrl).toBeNull();
});
