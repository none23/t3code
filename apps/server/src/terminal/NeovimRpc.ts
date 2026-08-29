// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalTimers:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { Packr, Unpackr } from "msgpackr";

export interface NeovimRpcNotifications {
  readonly onDirty: (dirty: boolean) => void;
  readonly onWritten: (path: string) => void;
  readonly onActiveFile: (path: string | null, paths: ReadonlyArray<string>) => void;
}

export interface NeovimRpcEndpoint {
  readonly address: string;
  readonly swapDirectory: string;
  readonly cleanup: () => Promise<void>;
}

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
};

type IncompleteDecodeError = Error & {
  readonly incomplete: true;
  readonly lastPosition: number;
  readonly values?: unknown;
};

const OPEN_FILE_LUA = String.raw`
local path, line, column = ...
if vim.fn.filereadable(path) ~= 1 then
  error("T3_FILE_NOT_FOUND:" .. path)
end

-- The edit itself must run on the main loop (vim.schedule); by then the RPC
-- request has already returned, so failures are surfaced inside Neovim via
-- vim.notify instead of the RPC response.
vim.schedule(function()
  local ok, err = pcall(function()
    if vim.api.nvim_buf_get_name(0) ~= path then
      local edited, edit_error = pcall(vim.api.nvim_cmd, { cmd = "edit", args = { path } }, {})
      if not edited then
        if string.find(tostring(edit_error), "E37", 1, true) then
          vim.api.nvim_cmd({ cmd = "tabedit", args = { path } }, {})
        else
          error(edit_error)
        end
      end
    end

    if line == nil then
      return
    end
    local buffer = vim.api.nvim_get_current_buf()
    local last_line = math.max(1, vim.api.nvim_buf_line_count(buffer))
    local target_line = math.min(math.max(1, line), last_line)
    local line_text = vim.api.nvim_buf_get_lines(buffer, target_line - 1, target_line, true)[1] or ""
    local target_column = math.min(math.max(0, column), #line_text)
    vim.api.nvim_win_set_cursor(0, { target_line, target_column })
    vim.cmd("normal! zz")
  end)
  if not ok then
    vim.notify("t3-code failed to open " .. path .. ": " .. tostring(err), vim.log.levels.ERROR)
  end
end)
return true
`;

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const STARTUP_DEADLINE_MS = 30_000;
const CONNECT_DEADLINE_MS = 3_000;

const INSTALL_AUTOCMDS_LUA = String.raw`
local channel = ...

local function t3_notify(method, ...)
  if next(vim.api.nvim_get_chan_info(channel)) == nil then
    return
  end
  vim.rpcnotify(channel, method, ...)
end

local function listed_file_paths()
  local paths = {}
  local seen = {}
  for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
    if
      vim.api.nvim_buf_is_valid(buffer)
      and vim.bo[buffer].buflisted
      and vim.bo[buffer].buftype == ""
    then
      local path = vim.api.nvim_buf_get_name(buffer)
      if path ~= "" and not seen[path] then
        seen[path] = true
        table.insert(paths, path)
      end
    end
  end
  return paths
end

local function notify_dirty()
  local dirty = false
  for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_valid(buffer) and vim.bo[buffer].modified then
      dirty = true
      break
    end
  end
  t3_notify("t3_dirty", dirty)
end

local function notify_active_file()
  local active_path = vim.api.nvim_buf_get_name(0)
  local paths = listed_file_paths()
  t3_notify("t3_active_file", active_path ~= "" and active_path or vim.NIL, paths)
end

local function install()
  local group = vim.api.nvim_create_augroup("T3CodeEmbeddedNeovim", { clear = true })

  _G.T3CodeEmbeddedNeovimQuitCommand = function()
    if vim.fn.getcmdtype() ~= ":" or vim.fn.getcmdline() ~= "q" then
      return "q"
    end
    return #listed_file_paths() > 1 and "bdelete" or "q"
  end

  vim.cmd([[cnoreabbrev <expr> q v:lua.T3CodeEmbeddedNeovimQuitCommand()]])

  vim.api.nvim_create_autocmd({ "BufModifiedSet", "BufAdd", "BufDelete", "BufWipeout" }, {
    group = group,
    callback = function()
      vim.schedule(notify_dirty)
    end,
  })

  vim.api.nvim_create_autocmd("BufWritePost", {
    group = group,
    callback = function(args)
      t3_notify("t3_written", vim.api.nvim_buf_get_name(args.buf))
      vim.schedule(notify_dirty)
    end,
  })

  vim.api.nvim_create_autocmd({ "BufAdd", "BufDelete", "BufWipeout", "BufEnter" }, {
    group = group,
    callback = function()
      vim.schedule(notify_active_file)
    end,
  })

  notify_dirty()
  notify_active_file()
end

if vim.v.vim_did_enter == 1 then
  install()
else
  local bootstrap_group = vim.api.nvim_create_augroup("T3CodeEmbeddedNeovimBootstrap", {
    clear = true,
  })
  vim.api.nvim_create_autocmd("VimEnter", {
    group = bootstrap_group,
    once = true,
    callback = install,
  })
end
return true
`;

const READ_DIRTY_LUA = String.raw`
for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
  if vim.api.nvim_buf_is_valid(buffer) and vim.bo[buffer].modified then
    return true
  end
end
return false
`;

const CHECKTIME_LUA = String.raw`
vim.schedule(function()
  vim.cmd("checktime")
end)
return true
`;

const CLOSE_FILE_LUA = String.raw`
local path = ...
for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
  if vim.api.nvim_buf_is_valid(buffer) and vim.api.nvim_buf_get_name(buffer) == path then
    vim.api.nvim_buf_delete(buffer, { force = true })
    return true
  end
end
return false
`;

function rpcError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (Array.isArray(value)) {
    const message = value.find((item) => typeof item === "string");
    if (typeof message === "string") return new Error(message);
  }
  return new Error(typeof value === "string" ? value : "Neovim RPC request failed.");
}

function isIncompleteDecodeError(error: unknown): error is IncompleteDecodeError {
  return (
    error instanceof Error &&
    "incomplete" in error &&
    error.incomplete === true &&
    "lastPosition" in error &&
    typeof error.lastPosition === "number"
  );
}

function connectSocket(address: string, timeoutMs: number): Promise<NodeNet.Socket> {
  return new Promise((resolve, reject) => {
    const socket = NodeNet.createConnection(address);
    // A connect attempt can hang indefinitely (for example on a stale unix
    // socket path). Callers run under the per-thread terminal lock, so every
    // attempt must resolve or fail within a bounded time.
    const fail = (error: Error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error(`Timed out connecting to Neovim at ${address}.`)),
      timeoutMs,
    );
    socket.once("error", fail);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.off("error", fail);
      socket.setNoDelay(true);
      resolve(socket);
    });
  });
}

async function connectWithRetry(address: string): Promise<NodeNet.Socket> {
  const deadline = Date.now() + CONNECT_DEADLINE_MS;
  let lastError: unknown;
  do {
    try {
      return await connectSocket(address, Math.max(50, deadline - Date.now()));
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  } while (Date.now() < deadline);
  throw rpcError(lastError);
}

export async function createNeovimRpcEndpoint(
  platform: NodeJS.Platform,
): Promise<NeovimRpcEndpoint> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-nvim-"));
  if (platform === "win32") {
    return {
      address: `\\\\.\\pipe\\t3-nvim-${NodeCrypto.randomUUID()}`,
      swapDirectory: directory,
      cleanup: () => NodeFSP.rm(directory, { recursive: true, force: true }),
    };
  }

  return {
    address: NodePath.join(directory, "nvim.sock"),
    swapDirectory: directory,
    cleanup: () => NodeFSP.rm(directory, { recursive: true, force: true }),
  };
}

/**
 * Extracts the running Neovim's version from `nvim_get_api_info` metadata.
 * Returns undefined when the shape is unrecognized so the caller fails open
 * instead of rejecting future metadata formats.
 */
function readNeovimVersion(
  metadata: unknown,
): { major: number; minor: number; patch: number } | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const version = (metadata as { version?: unknown }).version;
  if (typeof version !== "object" || version === null) return undefined;
  const { major, minor, patch } = version as { major?: unknown; minor?: unknown; patch?: unknown };
  if (typeof major !== "number" || typeof minor !== "number") return undefined;
  return { major, minor, patch: typeof patch === "number" ? patch : 0 };
}

export class NeovimRpcClient {
  readonly #socket: NodeNet.Socket;
  readonly #packr = new Packr({ useRecords: false });
  readonly #pending = new Map<number, PendingRequest>();
  readonly #notifications: NeovimRpcNotifications;
  #nextRequestId = 1;
  #closed = false;

  private constructor(socket: NodeNet.Socket, notifications: NeovimRpcNotifications) {
    this.#socket = socket;
    this.#notifications = notifications;
    void this.#readMessages();
  }

  static async connect(
    address: string,
    notifications: NeovimRpcNotifications,
  ): Promise<NeovimRpcClient> {
    const client = new NeovimRpcClient(await connectWithRetry(address), notifications);
    // The handshake runs under the per-thread terminal lock, so the whole
    // startup shares one deadline instead of stacking per-request timeouts.
    const deadline = Date.now() + STARTUP_DEADLINE_MS;
    const remainingMs = () => Math.max(1, deadline - Date.now());
    try {
      const apiInfo = await client.request("nvim_get_api_info", [], remainingMs());
      if (!Array.isArray(apiInfo) || typeof apiInfo[0] !== "number") {
        throw new Error("Neovim returned an invalid API handshake.");
      }
      const channel = apiInfo[0];
      // The injected Lua depends on vim.api.nvim_cmd and vim.fs.normalize,
      // both introduced in Neovim 0.8. Reject older builds here with a clear
      // message instead of failing cryptically mid-edit.
      const version = readNeovimVersion(apiInfo[1]);
      if (version !== undefined && version.major === 0 && version.minor < 8) {
        throw new Error(
          `T3 Code requires Neovim 0.8 or newer; found ${version.major}.${version.minor}.${version.patch}.`,
        );
      }
      await client.request(
        "nvim_set_client_info",
        ["t3-code", { major: 1 }, "remote", {}, { website: "https://t3.codes" }],
        remainingMs(),
      );
      await client.request("nvim_exec_lua", [INSTALL_AUTOCMDS_LUA, [channel]], remainingMs());
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  async openFile(path: string, line?: number, column = 1): Promise<void> {
    // User autocmds and language servers own the edit lifecycle. Schedule it
    // inside Neovim so their synchronous work cannot exhaust T3's RPC timeout.
    const args = line === undefined ? [path] : [path, line, column - 1];
    await this.request("nvim_exec_lua", [OPEN_FILE_LUA, args]);
  }

  async checktime(): Promise<void> {
    // File watchers and user autocmds may do synchronous work during
    // :checktime. Keep that work on Neovim's event loop so it cannot block
    // T3's control channel.
    await this.request("nvim_exec_lua", [CHECKTIME_LUA, []]);
  }

  async closeFile(path: string): Promise<void> {
    await this.request("nvim_exec_lua", [CLOSE_FILE_LUA, [path]]);
  }

  async isDirty(): Promise<boolean> {
    return (await this.request("nvim_exec_lua", [READ_DIRTY_LUA, []])) === true;
  }

  request(
    method: string,
    params: readonly unknown[],
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("Neovim RPC connection is closed."));
    const requestId = this.#nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(requestId)) return;
        reject(new Error(`Neovim RPC request timed out: ${method}`));
      }, timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timeout });
      this.#socket.write(this.#packr.pack([0, requestId, method, params]), (error) => {
        if (!error) return;
        this.#pending.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.destroy();
    this.#failPending(new Error("Neovim RPC connection closed."));
  }

  async #readMessages(): Promise<void> {
    const unpackr = new Unpackr({ useRecords: false });
    let incomplete: Buffer | undefined;
    try {
      for await (const chunk of this.#socket) {
        const buffer = incomplete === undefined ? chunk : Buffer.concat([incomplete, chunk]);
        incomplete = undefined;
        let decoded: unknown;
        try {
          decoded = unpackr.unpackMultiple(buffer);
        } catch (error) {
          if (!isIncompleteDecodeError(error)) throw error;
          incomplete = buffer.subarray(error.lastPosition);
          decoded = error.values;
        }
        if (!Array.isArray(decoded)) continue;
        for (const message of decoded) {
          if (!Array.isArray(message)) continue;
          if (message[0] === 1 && typeof message[1] === "number") {
            const pending = this.#pending.get(message[1]);
            if (!pending) continue;
            this.#pending.delete(message[1]);
            clearTimeout(pending.timeout);
            if (message[2] == null) pending.resolve(message[3]);
            else pending.reject(rpcError(message[2]));
            continue;
          }
          if (message[0] !== 2 || typeof message[1] !== "string") continue;
          const params = Array.isArray(message[2]) ? message[2] : [];
          if (message[1] === "t3_dirty" && typeof params[0] === "boolean") {
            this.#notifications.onDirty(params[0]);
          } else if (message[1] === "t3_written" && typeof params[0] === "string") {
            this.#notifications.onWritten(params[0]);
          } else if (
            message[1] === "t3_active_file" &&
            (params[0] === null || typeof params[0] === "string") &&
            Array.isArray(params[1]) &&
            params[1].every((path) => typeof path === "string")
          ) {
            this.#notifications.onActiveFile(params[0], params[1]);
          }
        }
      }
    } catch (error) {
      if (!this.#closed) this.#failPending(rpcError(error));
    } finally {
      // The read loop can die on a decode error while the socket is still
      // open. Destroy it here so close() being a no-op afterwards cannot leak
      // the file descriptor.
      this.#closed = true;
      this.#socket.destroy();
      this.#failPending(new Error("Neovim RPC connection closed."));
    }
  }

  #failPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
