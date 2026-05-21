import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionRunner, type SessionEvent } from '../../core/session-runner.js';
import type { Session } from '../../shared/types.js';

export type TerminalState = {
  name: string;
  status: 'idle' | 'starting' | 'running' | 'exited' | 'killed' | 'error';
  exitCode: number | null;
  error?: string;
  lines: { stream: 'stdout' | 'stderr'; text: string }[];
};

export type RunState = {
  running: boolean;
  terminals: Map<string, TerminalState>;
  allDone: boolean;
};

const MAX_LINES = 500;

export function useSessionRun(resolveProjectPath: (ref: string) => string) {
  const runnerRef = useRef<SessionRunner | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const queueRef = useRef<SessionEvent[]>([]);
  const [state, setState] = useState<RunState>({
    running: false,
    terminals: new Map(),
    allDone: false,
  });

  const flush = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const drain = queueRef.current;
    queueRef.current = [];
    setState((prev) => {
      const next = new Map(prev.terminals);
      let allDone = prev.allDone;
      let running = prev.running;
      for (const ev of drain) {
        if (ev.kind === 'all-done') {
          allDone = true;
          running = false;
          continue;
        }
        const cur = next.get(ev.terminal) ?? {
          name: ev.terminal,
          status: 'idle' as const,
          exitCode: null,
          lines: [],
        };
        if (ev.kind === 'start') {
          next.set(ev.terminal, { ...cur, status: 'running' });
        } else if (ev.kind === 'line') {
          const lines = cur.lines.concat({ stream: ev.stream, text: ev.text });
          if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
          next.set(ev.terminal, { ...cur, lines });
        } else if (ev.kind === 'exit') {
          next.set(ev.terminal, { ...cur, status: 'exited', exitCode: ev.code });
        } else if (ev.kind === 'killed') {
          next.set(ev.terminal, { ...cur, status: 'killed', exitCode: null });
        } else if (ev.kind === 'error') {
          next.set(ev.terminal, { ...cur, status: 'error', error: ev.error });
        }
      }
      return { running, terminals: next, allDone };
    });
  }, []);

  useEffect(() => {
    const id = setInterval(flush, 100);
    return () => clearInterval(id);
  }, [flush]);

  const start = useCallback(
    async (session: Session) => {
      if (runnerRef.current) return;
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const runner = new SessionRunner({ resolveProjectPath });
      runnerRef.current = runner;
      const initial = new Map<string, TerminalState>();
      for (const t of session.terminals) {
        initial.set(t.name, {
          name: t.name,
          status: 'starting',
          exitCode: null,
          lines: [],
        });
      }
      setState({ running: true, terminals: initial, allDone: false });
      try {
        for await (const ev of runner.run(session, { signal: ctrl.signal })) {
          queueRef.current.push(ev);
        }
      } finally {
        flush();
        runnerRef.current = null;
        ctrlRef.current = null;
        setState((prev) => ({ ...prev, running: false }));
      }
    },
    [resolveProjectPath, flush],
  );

  const kill = useCallback(async (name: string) => {
    await runnerRef.current?.kill(name);
  }, []);

  const restart = useCallback(async (name: string) => {
    await runnerRef.current?.restart(name);
  }, []);

  const stop = useCallback(() => {
    ctrlRef.current?.abort();
  }, []);

  return { state, start, kill, restart, stop };
}
