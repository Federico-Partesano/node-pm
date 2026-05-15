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
  useInput((_input, key) => {
    if (!focused) return;
    const idx = groups.findIndex((g) => g.name === selected);
    if (key.upArrow && idx > 0) onSelect(groups[idx - 1]!.name);
    if (key.downArrow && idx < groups.length - 1) onSelect(groups[idx + 1]!.name);
  }, { isActive: focused });

  return (
    <Panel title="Groups" focused={focused}>
      {groups.map((g) => {
        const sel = g.name === selected;
        return (
          <Text key={g.name} color={sel ? 'green' : undefined}>
            {sel ? '> ' : '  '}{g.name.padEnd(12)} {g.count}
          </Text>
        );
      })}
    </Panel>
  );
}
