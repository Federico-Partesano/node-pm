import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { SnapshotPhase } from '../../../core/snapshot.js';

type Props = {
  phases: SnapshotPhase[];
  done: SnapshotPhase[];
  current?: SnapshotPhase;
};

export function PhaseList({ phases, done, current }: Props) {
  return (
    <Box flexDirection="column">
      {phases.map((p) => {
        const isDone = done.includes(p);
        const isCurrent = p === current;
        const icon = isDone ? '✓' : isCurrent ? null : '·';
        const color = isDone ? 'green' : isCurrent ? 'cyan' : 'gray';
        return (
          <Box key={p}>
            <Box width={3}>
              {icon ? (
                <Text color={color}>{icon}</Text>
              ) : (
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
              )}
            </Box>
            <Text color={isCurrent ? 'cyanBright' : isDone ? 'green' : 'gray'} bold={isCurrent}>
              {p}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
