import React from 'react';
import { Text, useInput } from 'ink';
import { Panel } from '../components/Panel.js';

export type GroupSummary = { name: string; count: number };

type Props = {
  groups: GroupSummary[];
  selected: string;
  focused: boolean;
  onSelect: (name: string) => void;
};

export function Groups({ groups, selected, focused, onSelect }: Props) {
  useInput((input, key) => {
    if (!focused) return;
    const idx = groups.findIndex((g) => g.name === selected);
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && idx > 0) onSelect(groups[idx - 1]!.name);
    if (down && idx < groups.length - 1) onSelect(groups[idx + 1]!.name);
  }, { isActive: focused });

  return (
    <Panel title="Groups" subtitle={`${groups.length}`} focused={focused} accent="magenta">
      {groups.length === 0 && <Text dimColor>none</Text>}
      {groups.map((g) => {
        const sel = g.name === selected;
        return (
          <Text key={g.name}>
            <Text color={sel ? 'green' : 'gray'}>{sel ? '❯ ' : '  '}</Text>
            <Text color={sel ? 'greenBright' : undefined} bold={sel}>{g.name}</Text>
            <Text dimColor>  ({g.count})</Text>
          </Text>
        );
      })}
    </Panel>
  );
}
