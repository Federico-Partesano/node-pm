import React from 'react';
import { Box, Text } from 'ink';
import type { QueueTask } from '../hooks/useQueue.js';

export function Tasks({ tasks }: { tasks: QueueTask[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">Tasks</Text>
      {tasks.length === 0 && <Text dimColor>idle</Text>}
      {tasks.map((t) => {
        if (t.status === 'running') {
          const pct = t.progress?.percent;
          const bar = renderBar(pct ?? -1);
          return <Text key={t.name}>▶ {t.name.padEnd(20)} {bar} {pct !== undefined ? `${pct}%` : '...'}</Text>;
        }
        if (t.status === 'done') {
          return <Text key={t.name} color="green">✓ {t.name}</Text>;
        }
        return <Text key={t.name} color="red">✗ {t.name} — {(t.error as Error)?.message ?? 'error'}</Text>;
      })}
    </Box>
  );
}

function renderBar(percent: number, width = 12): string {
  if (percent < 0) return '░'.repeat(width);
  const filled = Math.round((percent / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
