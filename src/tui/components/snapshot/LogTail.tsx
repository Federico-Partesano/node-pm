import React from 'react';
import { Box, Text } from 'ink';

export type LogLine = { level: 'info' | 'warn'; message: string };
type Props = { lines: LogLine[]; max?: number };

export function LogTail({ lines, max = 10 }: Props) {
  const tail = lines.slice(-max);
  return (
    <Box flexDirection="column">
      {tail.map((l, i) => (
        <Text
          key={i}
          color={l.level === 'warn' ? 'yellow' : undefined}
          dimColor={l.level === 'info'}
        >
          {l.message}
        </Text>
      ))}
    </Box>
  );
}
