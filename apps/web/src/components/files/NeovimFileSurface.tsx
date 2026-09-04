import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { terminalOutputText } from "@t3tools/client-runtime/state/terminal";
import { NEOVIM_TERMINAL_ID, type EnvironmentId, type ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { useClientSettings } from "~/hooks/useSettings";
import { useTheme } from "~/hooks/useTheme";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { GhosttyTerminalSurface } from "~/terminal/ghostty/surface";
import {
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
  TYPOGRAPHY_ADVANCED_STORAGE_KEY,
} from "~/appearanceFonts";
import { terminalThemeFromApp } from "~/components/ThreadTerminalDrawer";
import { terminalEnvironment } from "~/state/terminal";
import { useAttachedTerminalSession } from "~/state/terminalSessions";
import { useAtomCommand } from "~/state/use-atom-command";

// An "error" status is often a transient attach-stream failure that recovers
// on reconnect; only a status that persists this long closes the panel.
const NEOVIM_ERROR_EXIT_GRACE_MS = 5_000;

interface NeovimFileSurfaceProps {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly cwd: string;
  readonly path: string;
  readonly line: number | null;
  readonly revealRequestId: number;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onWritten: (path: string) => void;
  readonly onFilesChange: (path: string | null, paths: ReadonlyArray<string>) => void;
  readonly onExit: (unexpected: boolean) => void;
}

function NeovimTerminal({
  environmentId,
  threadRef,
  focusRequestId,
  onDirtyChange,
  onWritten,
  onFilesChange,
  onExit,
}: Omit<NeovimFileSurfaceProps, "path" | "line" | "revealRequestId" | "cwd"> & {
  readonly focusRequestId: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<GhosttyTerminalSurface | null>(null);
  const previousBufferRef = useRef("");
  const handledExitRef = useRef(false);
  const write = useAtomCommand(terminalEnvironment.write, {
    reportFailure: false,
  });
  const resize = useAtomCommand(terminalEnvironment.resize, {
    reportFailure: false,
  });
  const { resolvedTheme } = useTheme();
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const fontFamily = useClientSettings((settings) =>
    resolveTerminalFontPreference({
      advanced: advancedTypography,
      code: settings.fontFamilyCode,
      terminal: settings.fontFamilyTerminal,
    }),
  );
  const fontSize = useClientSettings((settings) =>
    resolveTerminalFontSizePreference({
      advanced: advancedTypography,
      code: settings.fontSizeCode,
      terminal: settings.fontSizeTerminal,
    }),
  );
  const attachInput = useMemo(
    () => ({ threadId: threadRef.threadId, terminalId: NEOVIM_TERMINAL_ID }),
    [threadRef.threadId],
  );
  const session = useAttachedTerminalSession({
    environmentId,
    terminal: attachInput,
  });
  const buffer = terminalOutputText(session.output);
  // The attach snapshot can arrive while Ghostty is still loading its WASM and fonts.
  // Creation must replay that newest buffer, not the empty buffer from its first render.
  const latestBufferRef = useRef(buffer);
  latestBufferRef.current = buffer;
  // Start from the session's current versions so a remount does not replay
  // write/file notifications that were already handled.
  const handledWrittenVersionRef = useRef(session.writtenVersion);
  const handledActiveFileVersionRef = useRef(session.activeFileVersion);
  const notifyDirty = useEffectEvent(onDirtyChange);
  const notifyWritten = useEffectEvent(onWritten);
  const notifyFilesChange = useEffectEvent(onFilesChange);
  const notifyExit = useEffectEvent(onExit);

  useEffect(() => notifyDirty(session.dirty), [session.dirty]);

  useEffect(() => {
    if (!session.writtenPath || handledWrittenVersionRef.current === session.writtenVersion) return;
    handledWrittenVersionRef.current = session.writtenVersion;
    notifyWritten(session.writtenPath);
  }, [session.writtenPath, session.writtenVersion]);

  useEffect(() => {
    if (
      !session.activeFilePath ||
      handledActiveFileVersionRef.current === session.activeFileVersion
    )
      return;
    handledActiveFileVersionRef.current = session.activeFileVersion;
    notifyFilesChange(session.activeFilePath, session.filePaths);
  }, [session.activeFilePath, session.activeFileVersion, session.filePaths]);

  useEffect(() => {
    if (session.status === "running") {
      handledExitRef.current = false;
      return;
    }
    if (handledExitRef.current) return;
    if (session.status === "exited") {
      handledExitRef.current = true;
      notifyExit(
        (typeof session.summary?.exitCode === "number" && session.summary.exitCode !== 0) ||
          (typeof session.summary?.exitSignal === "number" && session.summary.exitSignal !== 0),
      );
      return;
    }
    if (session.status !== "error") return;
    // Give a transient stream error time to recover before treating it as a
    // dead session; the cleanup cancels the exit when the status changes.
    const timer = setTimeout(() => {
      handledExitRef.current = true;
      notifyExit(true);
    }, NEOVIM_ERROR_EXIT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [session.status, session.summary?.exitCode, session.summary?.exitSignal]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let terminal: GhosttyTerminalSurface | null = null;
    void GhosttyTerminalSurface.create(mount, {
      theme: terminalThemeFromApp(mount),
      font: { family: fontFamily, size: fontSize },
      onData: (data) => {
        void write({
          environmentId,
          input: {
            threadId: threadRef.threadId,
            terminalId: NEOVIM_TERMINAL_ID,
            data,
          },
        });
      },
      onResize: (cols, rows) => {
        void resize({
          environmentId,
          input: {
            threadId: threadRef.threadId,
            terminalId: NEOVIM_TERMINAL_ID,
            cols,
            rows,
          },
        });
      },
      onSelectionChange: () => undefined,
      onLinkActivate: () => undefined,
      beforeKey: (event) => {
        if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "w") {
          event.preventDefault();
          event.stopPropagation();
          void write({
            environmentId,
            input: {
              threadId: threadRef.threadId,
              terminalId: NEOVIM_TERMINAL_ID,
              data: "\u0017",
            },
          });
          return false;
        }
        return true;
      },
    }).then((created) => {
      if (cancelled) {
        created.dispose();
        return;
      }
      terminal = created;
      terminalRef.current = created;
      const buffer = latestBufferRef.current;
      previousBufferRef.current = buffer;
      if (buffer) created.resetAndWrite(buffer);
      created.focus();
    });
    return () => {
      cancelled = true;
      terminalRef.current = null;
      terminal?.dispose();
    };
  }, [environmentId, fontFamily, fontSize, resize, resolvedTheme, threadRef.threadId, write]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const previous = previousBufferRef.current;
    if (buffer.startsWith(previous)) terminal.write(buffer.slice(previous.length));
    else terminal.resetAndWrite(buffer);
    previousBufferRef.current = buffer;
  }, [buffer, session.version]);

  useEffect(() => {
    terminalRef.current?.focus();
  }, [focusRequestId]);

  return <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden bg-background" />;
}

export function NeovimFileSurface(props: NeovimFileSurfaceProps) {
  const open = useAtomCommand(terminalEnvironment.openNeovim, {
    reportFailure: false,
  });
  const [ready, setReady] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setOpenError(null);
    void open({
      environmentId: props.environmentId,
      input: {
        threadId: props.threadRef.threadId,
        cwd: props.cwd,
        worktreePath: props.cwd,
        path: props.path,
        ...(props.line !== null ? { line: props.line } : {}),
      },
    }).then((result) => {
      if (requestId !== requestRef.current) return;
      if (result._tag === "Success") {
        setReady(true);
        setFocusRequestId((current) => current + 1);
        return;
      }
      if (isAtomCommandInterrupted(result)) {
        setReady(false);
        setOpenError("Opening the file in Neovim was interrupted.");
        return;
      }
      const error = squashAtomCommandFailure(result);
      if (
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        error._tag === "NeovimFileNotFoundError"
      ) {
        setReady(false);
        setOpenError("The file no longer exists.");
        return;
      }
      setReady(false);
      setOpenError(error instanceof Error ? error.message : "Neovim could not be started.");
    });
  }, [
    open,
    props.cwd,
    props.environmentId,
    props.line,
    props.path,
    props.revealRequestId,
    props.threadRef.threadId,
  ]);

  if (openError !== null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-destructive">
        {openError}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
        Starting Neovim…
      </div>
    );
  }

  return (
    <NeovimTerminal
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      focusRequestId={focusRequestId}
      onDirtyChange={props.onDirtyChange}
      onWritten={props.onWritten}
      onFilesChange={props.onFilesChange}
      onExit={props.onExit}
    />
  );
}
