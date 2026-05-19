import { useEffect, useState } from 'react';
import type { SnapshotEvent } from '../../core/snapshot.js';
import type { Project } from '../../shared/types.js';
import type { RowStatus } from '../components/snapshot/ProjectRow.js';
import type { LogLine } from '../components/snapshot/LogTail.js';

export type SnapshotRowState = {
  status: RowStatus;
  percent: number;
  detail?: string;
};

export type UseSnapshotEventsResult = {
  rows: Map<string, SnapshotRowState>;
  log: LogLine[];
  bytes: number;
  done: number;
  finished: boolean;
};

const keyOf = (p: Project): string => `${p.group}/${p.name}`;

export function useSnapshotEvents(
  projects: Project[],
  events: AsyncIterable<SnapshotEvent> | null,
): UseSnapshotEventsResult {
  const [rows, setRows] = useState<Map<string, SnapshotRowState>>(
    () => new Map(projects.map((p) => [keyOf(p), { status: 'pending', percent: 0 }])),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [bytes, setBytes] = useState(0);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setRows(new Map(projects.map((p) => [keyOf(p), { status: 'pending', percent: 0 }])));
    setLog([]);
    setBytes(0);
    setDone(0);
    setFinished(false);
  }, [projects]);

  useEffect(() => {
    if (!events) return;
    let stop = false;
    (async () => {
      for await (const ev of events) {
        if (stop) break;
        setRows((prev) => {
          const next = new Map(prev);
          if (ev.kind === 'project-start')
            next.set(keyOf(ev.project), { status: 'in-progress', percent: 0 });
          if (ev.kind === 'file-progress') {
            const k = keyOf(ev.project);
            const r = next.get(k);
            if (r)
              next.set(k, {
                ...r,
                percent: Math.round((ev.current / Math.max(1, ev.total)) * 100),
                detail: ev.path,
              });
          }
          if (ev.kind === 'project-done')
            next.set(keyOf(ev.project), { status: 'done', percent: 100 });
          if (ev.kind === 'project-error')
            next.set(keyOf(ev.project), {
              status: 'error',
              percent: 0,
              detail: ev.error,
            });
          return next;
        });
        if (ev.kind === 'project-done') {
          setDone((d) => d + 1);
          setBytes(
            (b) =>
              b +
              (ev as Extract<SnapshotEvent, { kind: 'project-done' }>).bytes,
          );
        }
        if (ev.kind === 'log')
          setLog((l) => [...l, { level: ev.level, message: ev.message }]);
        if (ev.kind === 'done') setFinished(true);
      }
    })();
    return () => {
      stop = true;
    };
  }, [events]);

  return { rows, log, bytes, done, finished };
}
