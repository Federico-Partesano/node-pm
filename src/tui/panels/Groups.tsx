import React from 'react';
import { Box, Text, useInput } from 'ink';

export type GroupSummary = { name: string; count: number };

type Props = {
  groups: GroupSummary[];
  selected: string;
  focused: boolean;
  onSelect: (name: string) => void;
};

export function Groups({ groups, selected, focused, onSelect }: Props) {
  useInput((_input, key) => {
    if (!focused) return;
    const idx = groups.findIndex((g) => g.name === selected);
    if (key.upArrow && idx > 0) onSelect(groups[idx - 1]!.name);
    if (key.downArrow && idx < groups.length - 1) onSelect(groups[idx + 1]!.name);
  }, { isActive: focused });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1}>
      <Text bold color="cyan">Groups</Text>
      {groups.map((g) => {
        const sel = g.name === selected;
        return (
          <Text key={g.name} color={sel ? 'green' : undefined}>
            {sel ? '> ' : '  '}{g.name.padEnd(12)} {g.count}
          </Text>
        );
      })}
    </Box>
  );
}
