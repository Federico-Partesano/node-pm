import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProjectRow, type RowStatus } from '../components/snapshot/ProjectRow.js';
import { LogTail, type LogLine } from '../components/snapshot/LogTail.js';
import { OverallBar } from '../components/snapshot/OverallBar.js';
import type { Project } from '../../shared/types.js';
import type { SnapshotEvent } from '../../core/snapshot.js';

type Props = {
  mode: 'create' | 'restore';
  projects: Project[];
  events: AsyncIterable<SnapshotEvent>;
  onExit: () => void;
};

type RowState = { status: RowStatus; percent: number; detail?: string };

function keyOf(p: Project): string {
  return `${p.group}/${p.name}`;
}

export function SnapshotPage({ mode, projects, events, onExit }: Props) {
  const [rows, setRows] = useState<Map<string, RowState>>(
    () => new Map(projects.map((p) => [keyOf(p), { status: 'pending', percent: 0 }])),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [bytes, setBytes] = useState(0);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

  useEffect(() => {
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

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyanBright">
        {mode === 'create' ? 'Creating snapshot' : 'Restoring snapshot'}
      </Text>
      <Box marginTop={1}>
        <OverallBar done={done} total={projects.length} bytes={bytes} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {projects.map((p) => {
          const r = rows.get(keyOf(p))!;
          return (
            <ProjectRow
              key={keyOf(p)}
              project={p}
              status={r.status}
              percent={r.percent}
              detail={r.detail}
            />
          );
        })}
      </Box>
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexDirection="column"
      >
        <LogTail lines={log} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {finished ? 'Done. Press Esc to return.' : 'Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
