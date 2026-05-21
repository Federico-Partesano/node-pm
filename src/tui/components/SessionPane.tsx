import React from 'react';
import { Box, Text } from 'ink';
import { Panel } from './Panel.js';
import type { TerminalState } from '../hooks/useSessionRun.js';

type Props = {
  state: TerminalState;
  focused?: boolean;
  maxLines?: number;
};

function statusBadge(s: TerminalState): { label: string; color: string } {
  switch (s.status) {
    case 'idle':
      return { label: 'idle', color: 'gray' };
    case 'starting':
      return { label: 'starting…', color: 'yellow' };
    case 'running':
      return { label: 'running', color: 'green' };
    case 'exited':
      return {
        label: s.exitCode === 0 ? 'exit 0' : `exit ${s.exitCode ?? '?'}`,
        color: s.exitCode === 0 ? 'green' : 'red',
      };
    case 'killed':
      return { label: 'killed', color: 'magenta' };
    case 'error':
      return { label: 'error', color: 'red' };
  }
}

export function SessionPane({ state, focused, maxLines = 20 }: Props) {
  const badge = statusBadge(state);
  const tail = state.lines.slice(-maxLines);
  return (
    <Panel
      title={state.name}
      subtitle={badge.label}
      accent={focused ? 'cyan' : 'blue'}
      focused={focused}
      flexGrow={1}
      minWidth={20}
    >
      <Box flexDirection="column">
        {state.error && <Text color="red">! {state.error}</Text>}
        {tail.length === 0 && <Text dimColor>(no output yet)</Text>}
        {tail.map((l, i) => (
          <Text
            key={`${state.name}-${i}`}
            color={l.stream === 'stderr' ? 'red' : undefined}
            dimColor={l.stream === 'stdout'}
          >
            {l.text}
          </Text>
        ))}
      </Box>
    </Panel>
  );
}
