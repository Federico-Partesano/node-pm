import React from 'react';
import { Box, Text } from 'ink';

type KeyHint = { key: string; label: string };

const HINTS: KeyHint[] = [
  { key: '↑↓/jk', label: 'nav' },
  { key: 'tab', label: 'panel' },
  { key: 'space', label: 'select' },
  { key: 'a/A', label: 'all/clear' },
  { key: 'p', label: 'pull' },
  { key: 'c', label: 'clone' },
  { key: 'C', label: 'clone-all' },
  { key: 'i', label: 'install' },
  { key: 'r', label: 'run' },
  { key: 'n', label: 'new' },
  { key: 'e', label: 'export' },
  { key: 'q', label: 'quit' },
];

export function Footer() {
  return (
    <Box paddingX={2} paddingY={0}>
      {HINTS.map((h, i) => (
        <Text key={h.key}>
          {i > 0 ? <Text dimColor>  ·  </Text> : null}
          <Text bold color="yellow">{h.key}</Text>
          <Text dimColor> {h.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
