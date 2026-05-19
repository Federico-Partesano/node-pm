import { useEffect, useState } from 'react';
import type { SnapshotEvent, SnapshotPhase } from '../../core/snapshot.js';
import type { Project } from '../../shared/types.js';
import type { RowStatus } from '../components/snapshot/ProjectRow.js';
import type { LogLine } from '../components/snapshot/LogTail.js';

export type SnapshotRowState = {
  status: RowStatus;
  percent: number;
  bytes?: number;
  detail?: string;
  warnings: number;
  errors: number;
  currentPhase?: SnapshotPhase;
  phasesDone: SnapshotPhase[];
  currentFile?: { path: string; current: number; total: number };
};

export const CREATE_PHASES: SnapshotPhase[] = [
  'diff',
  'untracked',
  'gitignored',
  'stash',
  'finalizing',
];

export const RESTORE_PHASES: SnapshotPhase[] = [
  'clone',
  'checkout',
  'reset',
  'apply-diff',
  'write-files',
  'apply-stash',
];

export type UseSnapshotEventsResult = {
  rows: Map<string, SnapshotRowState>;
  log: LogLine[];
  bytes: number;
  done: number;
  errors: number;
  warnings: number;
  finished: boolean;
  activeKey: string | null;
  outputPath: string | null;
};

const keyOf = (p: Project): string => `${p.group}/${p.name}`;

function freshRow(): SnapshotRowState {
  return { status: 'pending', percent: 0, warnings: 0, errors: 0, phasesDone: [] };
}

export function useSnapshotEvents(
  projects: Project[],
  events: AsyncIterable<SnapshotEvent> | null,
): UseSnapshotEventsResult {
  const [rows, setRows] = useState<Map<string, SnapshotRowState>>(
    () => new Map(projects.map((p) => [keyOf(p), freshRow()])),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [bytes, setBytes] = useState(0);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [finished, setFinished] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  useEffect(() => {
    setRows(new Map(projects.map((p) => [keyOf(p), freshRow()])));
    setLog([]);
    setBytes(0);
    setDone(0);
    setErrors(0);
    setWarnings(0);
    setFinished(false);
    setActiveKey(null);
    setOutputPath(null);
  }, [projects]);

  useEffect(() => {
    if (!events) return;
    let stop = false;
    (async () => {
      for await (const ev of events) {
        if (stop) break;
        setRows((prev) => {
          const next = new Map(prev);
          if (ev.kind === 'project-start') {
            next.set(keyOf(ev.project), { ...freshRow(), status: 'in-progress' });
          } else if (ev.kind === 'phase') {
            const k = keyOf(ev.project);
            const r = next.get(k);
            if (r) {
              const prevPhase = r.currentPhase;
              const phasesDone = prevPhase && !r.phasesDone.includes(prevPhase)
                ? [...r.phasesDone, prevPhase]
                : r.phasesDone;
              next.set(k, {
                ...r,
                currentPhase: ev.phase,
                phasesDone,
                currentFile: undefined,
              });
            }
          } else if (ev.kind === 'file-progress') {
            const k = keyOf(ev.project);
            const r = next.get(k);
            if (r) {
              next.set(k, {
                ...r,
                percent: Math.round((ev.current / Math.max(1, ev.total)) * 100),
                detail: ev.path,
                currentFile: { path: ev.path, current: ev.current, total: ev.total },
              });
            }
          } else if (ev.kind === 'project-done') {
            const k = keyOf(ev.project);
            const r = next.get(k) ?? freshRow();
            const phasesDone = r.currentPhase && !r.phasesDone.includes(r.currentPhase)
              ? [...r.phasesDone, r.currentPhase]
              : r.phasesDone;
            next.set(k, {
              ...r,
              status: 'done',
              percent: 100,
              bytes: ev.bytes,
              warnings: ev.warnings,
              phasesDone,
              currentPhase: undefined,
              currentFile: undefined,
            });
          } else if (ev.kind === 'project-error') {
            const k = keyOf(ev.project);
            const r = next.get(k) ?? freshRow();
            next.set(k, {
              ...r,
              status: 'error',
              percent: 0,
              detail: ev.error,
              errors: r.errors + 1,
              currentPhase: undefined,
              currentFile: undefined,
            });
          }
          return next;
        });

        if (ev.kind === 'project-start') setActiveKey(keyOf(ev.project));
        if (ev.kind === 'project-done') {
          setDone((d) => d + 1);
          setBytes((b) => b + ev.bytes);
          setWarnings((w) => w + ev.warnings);
          setActiveKey((curr) => (curr === keyOf(ev.project) ? null : curr));
        }
        if (ev.kind === 'project-error') {
          setErrors((e) => e + 1);
          setActiveKey((curr) => (curr === keyOf(ev.project) ? null : curr));
        }
        if (ev.kind === 'log') {
          setLog((l) => [...l, { level: ev.level, message: ev.message }]);
          if (ev.level === 'warn') setWarnings((w) => w + 1);
        }
        if (ev.kind === 'done') {
          setFinished(true);
          setOutputPath(ev.path);
          setActiveKey(null);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [events]);

  return {
    rows,
    log,
    bytes,
    done,
    errors,
    warnings,
    finished,
    activeKey,
    outputPath,
  };
}
