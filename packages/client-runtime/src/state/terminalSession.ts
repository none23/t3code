import type {
  EnvironmentId,
  TerminalAttachStreamEvent,
  TerminalMetadataStreamEvent,
  TerminalSessionSnapshot,
  TerminalSummary,
  ThreadId,
} from "@t3tools/contracts";
import {
  appendOutput,
  DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
  EMPTY_TERMINAL_OUTPUT_STATE,
  resetOutput,
  type TerminalOutputState,
} from "./terminalOutput.ts";

export {
  DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  readTerminalOutputUpdate,
  terminalOutputText,
  type TerminalOutputCursor,
  type TerminalOutputState,
  type TerminalOutputUpdate,
} from "./terminalOutput.ts";

export interface TerminalSessionState {
  readonly summary: TerminalSummary | null;
  readonly output: TerminalOutputState;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly hasRunningSubprocess: boolean;
  readonly dirty: boolean;
  readonly writtenPath: string | null;
  readonly writtenVersion: number;
  readonly activeFilePath: string | null;
  readonly activeFileVersion: number;
  readonly updatedAt: string | null;
  readonly version: number;
  readonly lifecycleVersion: number;
}

export interface TerminalBufferState {
  readonly output: TerminalOutputState;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly dirty: boolean;
  readonly writtenPath: string | null;
  readonly writtenVersion: number;
  readonly activeFilePath: string | null;
  readonly activeFileVersion: number;
  readonly updatedAt: string | null;
  readonly version: number;
  readonly lifecycleVersion: number;
}

export interface KnownTerminalSessionTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly terminalId: string;
}

export interface KnownTerminalSession {
  readonly target: KnownTerminalSessionTarget;
  readonly state: TerminalSessionState;
}

export function selectRunningSubprocessTerminalIds(
  sessions: ReadonlyArray<KnownTerminalSession>,
): ReadonlyArray<string> {
  return sessions
    .filter(
      (session) => session.state.summary?.kind !== "neovim" && session.state.hasRunningSubprocess,
    )
    .map((session) => session.target.terminalId);
}

export const EMPTY_TERMINAL_BUFFER_STATE = Object.freeze<TerminalBufferState>({
  output: EMPTY_TERMINAL_OUTPUT_STATE,
  status: "closed",
  error: null,
  dirty: false,
  writtenPath: null,
  writtenVersion: 0,
  activeFilePath: null,
  activeFileVersion: 0,
  updatedAt: null,
  version: 0,
  lifecycleVersion: 0,
});

export const EMPTY_TERMINAL_SESSION_STATE = Object.freeze<TerminalSessionState>({
  summary: null,
  output: EMPTY_TERMINAL_OUTPUT_STATE,
  status: "closed",
  error: null,
  hasRunningSubprocess: false,
  dirty: false,
  writtenPath: null,
  writtenVersion: 0,
  activeFilePath: null,
  activeFileVersion: 0,
  updatedAt: null,
  version: 0,
  lifecycleVersion: 0,
});

let terminalAttachGeneration = 0;

/** A reinstalled attach stream must not reuse an old renderer's output cursor. */
export function nextTerminalAttachSeedState(): TerminalBufferState {
  return {
    ...EMPTY_TERMINAL_BUFFER_STATE,
    output: {
      ...EMPTY_TERMINAL_OUTPUT_STATE,
      generation: ++terminalAttachGeneration,
    },
  };
}

export function terminalBufferStateFromSnapshot(
  snapshot: TerminalSessionSnapshot,
  maxBufferBytes: number,
  current: TerminalBufferState = EMPTY_TERMINAL_BUFFER_STATE,
): TerminalBufferState {
  return {
    output: resetOutput(current.output, snapshot.history, maxBufferBytes),
    status: snapshot.status,
    error: null,
    dirty: snapshot.dirty ?? false,
    writtenPath: null,
    writtenVersion: 0,
    activeFilePath: null,
    activeFileVersion: 0,
    updatedAt: snapshot.updatedAt,
    version: current.version + 1,
    lifecycleVersion: current.lifecycleVersion,
  };
}

function latestTimestamp(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function combineTerminalSessionState(
  summary: TerminalSummary | null,
  buffer: TerminalBufferState,
): TerminalSessionState {
  return {
    summary,
    output: buffer.output,
    status: buffer.version > 0 ? buffer.status : (summary?.status ?? buffer.status),
    error: buffer.error,
    hasRunningSubprocess: summary?.hasRunningSubprocess ?? false,
    dirty: buffer.version > 0 ? buffer.dirty : (summary?.dirty ?? false),
    writtenPath: buffer.writtenPath,
    writtenVersion: buffer.writtenVersion,
    activeFilePath: buffer.activeFilePath,
    activeFileVersion: buffer.activeFileVersion,
    updatedAt: latestTimestamp(summary?.updatedAt ?? null, buffer.updatedAt),
    version: buffer.version,
    lifecycleVersion: buffer.lifecycleVersion,
  };
}

export function applyTerminalAttachStreamEvent(
  current: TerminalBufferState,
  event: TerminalAttachStreamEvent,
  maxBufferBytes = DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
): TerminalBufferState {
  switch (event.type) {
    case "snapshot":
      return {
        ...terminalBufferStateFromSnapshot(event.snapshot, maxBufferBytes, current),
        lifecycleVersion:
          current.version === 0 ? current.lifecycleVersion : current.lifecycleVersion + 1,
      };
    case "restarted":
      return {
        ...terminalBufferStateFromSnapshot(event.snapshot, maxBufferBytes, current),
        lifecycleVersion: current.lifecycleVersion + 1,
      };
    case "output":
      return {
        ...current,
        output: appendOutput(current.output, event.data, maxBufferBytes),
        status: current.status === "closed" ? "running" : current.status,
        error: null,
        version: current.version + 1,
      };
    case "cleared":
      return {
        ...current,
        output: resetOutput(current.output, "", maxBufferBytes),
        error: null,
        version: current.version + 1,
      };
    case "exited":
      return {
        ...current,
        status: "exited",
        error: null,
        version: current.version + 1,
      };
    case "closed":
      return {
        ...current,
        status: "closed",
        error: null,
        version: current.version + 1,
      };
    case "error":
      return {
        ...current,
        status: "error",
        error: event.message,
        version: current.version + 1,
      };
    case "activity":
      return current;
    case "neovimState":
      return {
        ...current,
        dirty: event.dirty,
        version: current.version + 1,
      };
    case "neovimWritten":
      return {
        ...current,
        writtenPath: event.path,
        writtenVersion: current.version + 1,
        version: current.version + 1,
      };
    case "neovimActiveFile":
      return {
        ...current,
        activeFilePath: event.path,
        activeFileVersion: current.activeFileVersion + 1,
        version: current.version + 1,
      };
  }
}

export function applyTerminalMetadataStreamEvent(
  current: ReadonlyArray<TerminalSummary>,
  event: TerminalMetadataStreamEvent,
): ReadonlyArray<TerminalSummary> {
  if (event.type === "snapshot") {
    return event.terminals;
  }
  if (event.type === "remove") {
    return current.filter(
      (terminal) =>
        terminal.threadId !== event.threadId || terminal.terminalId !== event.terminalId,
    );
  }
  const next = current.filter(
    (terminal) =>
      terminal.threadId !== event.terminal.threadId ||
      terminal.terminalId !== event.terminal.terminalId,
  );
  return [...next, event.terminal];
}
