// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeNet from "node:net";
import * as NodeTimers from "node:timers";

import { expect, it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import { Packr, Unpackr } from "msgpackr";

import { createNeovimRpcEndpoint, NeovimRpcClient } from "./NeovimRpc.ts";

function listen(server: NodeNet.Server, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(address, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server: NodeNet.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

it.effect("decodes Neovim RPC responses split across socket chunks", () =>
  Effect.gen(function* () {
    const platform = yield* HostProcessPlatform;
    yield* Effect.tryPromise(async () => {
      const endpoint = await createNeovimRpcEndpoint(platform);
      const packr = new Packr({ useRecords: false });
      const unpackr = new Unpackr({ useRecords: false });
      const methods: string[] = [];
      const luaSources: string[] = [];
      let responseCount = 0;
      let startupChecks = 0;
      let notifyActiveFile: ((path: string) => void) | undefined;
      const activeFile = new Promise<string>((resolve) => {
        notifyActiveFile = resolve;
      });

      const server = NodeNet.createServer((socket) => {
        socket.on("data", (chunk) => {
          const decoded: unknown = unpackr.unpackMultiple(chunk);
          if (!Array.isArray(decoded)) return;
          for (const message of decoded) {
            if (!Array.isArray(message) || typeof message[1] !== "number") continue;
            const method = typeof message[2] === "string" ? message[2] : "";
            methods.push(method);
            if (method === "nvim_exec_lua") {
              const params = message[3];
              if (Array.isArray(params) && typeof params[0] === "string") {
                luaSources.push(params[0]);
              }
            }
            if (method === "nvim_unanswered") continue;
            let result: unknown = true;
            if (method === "nvim_get_api_info") result = [7, {}];
            else if (method === "nvim_eval") result = startupChecks++ > 0 ? 1 : 0;
            else if (
              method === "nvim_exec_lua" &&
              methods.filter((entry) => entry === method).length > 1
            ) {
              result = false;
            }
            const response = packr.pack([1, message[1], null, result]);
            if (responseCount++ === 0) {
              socket.write(response.subarray(0, 1));
              NodeTimers.setTimeout(() => socket.write(response.subarray(1)), 1);
            } else {
              socket.write(response);
            }
            if (
              method === "nvim_exec_lua" &&
              methods.filter((entry) => entry === method).length === 1
            ) {
              socket.write(packr.pack([2, "t3_active_file", ["/repo/example.ts"]]));
            }
          }
        });
      });

      await listen(server, endpoint.address);
      let client: NeovimRpcClient | undefined;
      try {
        client = await NeovimRpcClient.connect(endpoint.address, {
          onDirty: () => undefined,
          onWritten: () => undefined,
          onActiveFile: (path) => notifyActiveFile?.(path),
        });
        expect(await activeFile).toBe("/repo/example.ts");
        expect(await client.isDirty()).toBe(false);
        await client.checktime();
        expect(methods).toEqual([
          "nvim_get_api_info",
          "nvim_set_client_info",
          "nvim_eval",
          "nvim_eval",
          "nvim_exec_lua",
          "nvim_exec_lua",
          "nvim_exec_lua",
        ]);
        expect(luaSources.at(-1)).toContain('vim.cmd("checktime")');
        expect(luaSources.at(-1)).toContain("vim.schedule");
        await expect(client.request("nvim_unanswered", [], 10)).rejects.toThrow(
          "Neovim RPC request timed out: nvim_unanswered",
        );
      } finally {
        client?.close();
        await closeServer(server);
        await endpoint.cleanup();
      }
    });
  }),
);
