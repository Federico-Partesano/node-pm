import React from 'react';
import { Box, Text } from 'ink';
import type { QueueTask } from '../hooks/useQueue.js';
import { Panel } from '../components/Panel.js';

export const Tasks = React.memo(TasksImpl);
function TasksImpl({ tasks }: { tasks: QueueTask[] }) {
  const running = tasks.filter((t) => t.status === 'running').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  const subtitle = tasks.length === 0
    ? 'idle'
    : `${running} running · ${done} done · ${failed} failed`;
  return (
    <Panel title="Tasks" subtitle={subtitle} accent="yellow">
      {tasks.length === 0 && <Text dimColor>No tasks queued.</Text>}
      {tasks.map((t) => {
        if (t.status === 'running') {
          const pct = t.progress?.percent;
          return (
            <Box key={t.name}>
              <Text color="yellow">▶ </Text>
              <Text>{t.name.padEnd(22)} </Text>
              <ProgressBar percent={pct ?? -1} />
              <Text dimColor> {pct !== undefined ? `${pct}%` : '…'}</Text>
            </Box>
          );
        }
        if (t.status === 'done') {
          return (
            <Box key={t.name}>
              <Text color="green">✓ </Text>
              <Text>{t.name}</Text>
            </Box>
          );
        }
        return (
          <Box key={t.name}>
            <Text color="red">✗ </Text>
            <Text>{t.name} </Text>
            <Text dimColor>— {(t.error as Error)?.message ?? 'error'}</Text>
          </Box>
        );
      })}
    </Panel>
  );
}

function ProgressBar({ percent, width = 14 }: { percent: number; width?: number }) {
  if (percent < 0) {
    return <Text dimColor>{'·'.repeat(width)}</Text>;
  }
  const filled = Math.round((percent / 100) * width);
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(width - filled)}</Text>
    </Text>
  );
}
