import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { DiscoveredProject } from '../../../shared/types.js';

export type ReviewProps = {
  found: DiscoveredProject[];
  picked: Set<string>;
  cursor: number;
  onCursor: (i: number) => void;
  onToggle: (k: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onConfirm: () => void;
  onBack: () => void;
};

const keyOf = (p: DiscoveredProject) => `${p.group}/${p.name}`;

export function ReviewStep(p: ReviewProps) {
  useInput((input, key) => {
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && p.cursor > 0) p.onCursor(p.cursor - 1);
    if (down && p.cursor < p.found.length - 1) p.onCursor(p.cursor + 1);
    if (input === ' ' && p.found[p.cursor]) p.onToggle(keyOf(p.found[p.cursor]!));
    if (input === 'a') p.onSelectAll();
    if (input === 'A') p.onClear();
    if (key.return) p.onConfirm();
  });
  if (p.found.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} marginY={1}>
        <Text color="yellow">No projects discovered.</Text>
        <Text dimColor>Esc to retry with a different root.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginY={1}>
      <Text bold color="cyanBright">Review discovered projects ({p.picked.size}/{p.found.length} selected)</Text>
      <Box marginTop={1} flexDirection="column">
        {p.found.map((d, i) => {
          const k = keyOf(d);
          const sel = p.picked.has(k);
          const cur = i === p.cursor;
          return (
            <Box key={k}>
              <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
              <Text color={sel ? 'green' : 'gray'}>{sel ? '◉' : '○'}</Text>
              <Text> </Text>
              <Text bold={cur}>{d.group}/{d.name}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}><Text dimColor>↑↓/jk nav · space toggle · a all · A clear · Enter save · Esc back</Text></Box>
    </Box>
  );
}
