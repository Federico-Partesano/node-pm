import React from 'react';
import { Box, Text } from 'ink';

export type LogTab = { id: string; label: string; lines: string[] };

type Props = { tabs: LogTab[]; activeId: string | null };

export function Logs({ tabs, activeId }: Props) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold color="cyan">Logs</Text>
        {tabs.map((t) => (
          <Text key={t.id} color={t.id === active?.id ? 'green' : 'gray'}>{' '}{t.label}</Text>
        ))}
      </Box>
      {!active && <Text dimColor>no logs</Text>}
      {active?.lines.slice(-20).map((l, i) => <Text key={i}>{l}</Text>)}
    </Box>
  );
}
