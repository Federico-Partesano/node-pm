import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { execa } from 'execa';

export type HealthCheckKind = 'lint' | 'typecheck' | 'test' | 'build';

export type HealthCheckState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | {
      status: 'ok' | 'fail';
      exitCode: number;
      durationMs: number;
      tail: string;
      summary?: string;
    };

export type HealthChecksByProject = Partial<Record<HealthCheckKind, HealthCheckState>>;

type Listener = () => void;
type CacheRecord = { checks: HealthChecksByProject; version: number };

const cache = new Map<string, CacheRecord>();
const listeners = new Set<Listener>();

function ensureRecord(key: string): CacheRecord {
  let r = cache.get(key);
  if (!r) {
    r = { checks: {}, version: 0 };
    cache.set(key, r);
  }
  return r;
}

function bump(key: string, mutate: (r: CacheRecord) => void) {
  const r = ensureRecord(key);
  mutate(r);
  r.version += 1;
  for (const l of listeners) l();
}

function summarise(stdout: string, stderr: string): string | undefined {
  const blob = `${stdout}\n${stderr}`;
  // eslint style "X problems (Y errors, Z warnings)"
  const problems = /(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/i.exec(blob);
  if (problems) return `${problems[1]} problems · ${problems[2]} err · ${problems[3]} warn`;
  // tsc style "Found N errors"
  const tscErr = /Found (\d+) errors?/i.exec(blob);
  if (tscErr) return `${tscErr[1]} TS errors`;
  // vitest "Tests  X passed (Y)" / "Tests  N failed | M passed"
  const vitestFail = /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed/i.exec(blob);
  if (vitestFail) return `${vitestFail[1]} failed · ${vitestFail[2]} passed`;
  const vitestOk = /Tests\s+(\d+)\s+passed\s*\((\d+)\)/i.exec(blob);
  if (vitestOk) return `${vitestOk[1]}/${vitestOk[2]} passed`;
  return undefined;
}

function tail(text: string, lines = 6): string {
  const arr = text.replace(/\[[0-9;]*m/g, '').split('\n').filter(Boolean);
  return arr.slice(-lines).join('\n');
}

async function runScript(projectPath: string, scriptName: string, kind: HealthCheckKind) {
  bump(projectPath, (r) => {
    r.checks[kind] = { status: 'running', startedAt: Date.now() };
  });
  try {
    const startedAt = Date.now();
    const res = await execa('npm', ['run', '-s', scriptName], {
      cwd: projectPath,
      reject: false,
      timeout: 120_000,
    });
    const durationMs = Date.now() - startedAt;
    const text = tail(`${res.stdout ?? ''}\n${res.stderr ?? ''}`);
    const summary = summarise(res.stdout ?? '', res.stderr ?? '');
    bump(projectPath, (r) => {
      r.checks[kind] = {
        status: res.exitCode === 0 ? 'ok' : 'fail',
        exitCode: res.exitCode ?? -1,
        durationMs,
        tail: text,
        summary,
      };
    });
  } catch (err) {
    bump(projectPath, (r) => {
      r.checks[kind] = {
        status: 'fail',
        exitCode: -1,
        durationMs: 0,
        tail: (err as Error).message,
      };
    });
  }
}

export type RunPlan = Partial<Record<HealthCheckKind, string>>;

export function useHealthChecks(projectPath: string | null) {
  const subscribe = useCallback((listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    if (!projectPath) return 0;
    return cache.get(projectPath)?.version ?? 0;
  }, [projectPath]);
  // version is consumed for re-renders only
  useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const checks: HealthChecksByProject = projectPath
    ? (cache.get(projectPath)?.checks ?? {})
    : {};

  const runAll = useCallback(
    (plan: RunPlan) => {
      if (!projectPath) return;
      for (const [k, script] of Object.entries(plan)) {
        if (!script) continue;
        void runScript(projectPath, script, k as HealthCheckKind);
      }
    },
    [projectPath],
  );

  const runOne = useCallback(
    (kind: HealthCheckKind, script: string) => {
      if (!projectPath) return;
      void runScript(projectPath, script, kind);
    },
    [projectPath],
  );

  return { checks, runAll, runOne };
}
