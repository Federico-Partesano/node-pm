import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ProjectRow } from '../components/snapshot/ProjectRow.js';
import { LogTail } from '../components/snapshot/LogTail.js';
import { OverallBar } from '../components/snapshot/OverallBar.js';
import type { Project } from '../../shared/types.js';
import type { SnapshotEvent } from '../../core/snapshot.js';
import { useSnapshotEvents } from '../hooks/useSnapshotEvents.js';

type Props = {
  mode: 'create' | 'restore';
  projects: Project[];
  events: AsyncIterable<SnapshotEvent>;
  onExit: () => void;
};

const keyOf = (p: Project) => `${p.group}/${p.name}`;

export function SnapshotPage({ mode, projects, events, onExit }: Props) {
  const { rows, log, bytes, done, finished } = useSnapshotEvents(projects, events);

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

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
