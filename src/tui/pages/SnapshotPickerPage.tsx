import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { Project } from '../../shared/types.js';
import { usePicker } from '../hooks/usePicker.js';

type Props = {
  projects: Project[];
  title?: string;
  onConfirm: (picked: Project[]) => void;
  onCancel: () => void;
};

const keyOf = (p: Project) => `${p.group}/${p.name}`;
const groupOf = (p: Project) => p.group;

export function SnapshotPickerPage({
  projects,
  title = 'Select projects to snapshot',
  onConfirm,
  onCancel,
}: Props) {
  const picker = usePicker({ items: projects, keyOf, groupOf });
  const {
    cursor,
    picked,
    groupFilter,
    visible,
    pickedItems,
    moveUp,
    moveDown,
    toggle,
    selectAllVisible,
    clear,
    cycleGroup,
  } = picker;

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.upArrow || input === 'k') moveUp();
    if (key.downArrow || input === 'j') moveDown();
    if (input === ' ') toggle();
    if (input === 'a') selectAllVisible();
    if (input === 'A') clear();
    if (input === 'g') cycleGroup();
    if (key.return && pickedItems.length > 0) onConfirm(pickedItems);
  });

  if (projects.length === 0) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
      >
        <Text color="yellow">No projects in manifest.</Text>
        <Text dimColor>Esc to return.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyanBright">
        {title} ({picked.size}/{visible.length} selected
        {groupFilter ? ` · group: ${groupFilter}` : ''})
      </Text>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {visible.map((p, i) => {
          const k = keyOf(p);
          const sel = picked.has(k);
          const cur = i === cursor;
          return (
            <Box key={k}>
              <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
              <Text color={sel ? 'green' : 'gray'}>{sel ? '◉' : '○'}</Text>
              <Text> </Text>
              <Text bold={cur}>
                {p.group}/{p.name}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓/jk nav · space toggle · a all · A clear · g group filter · Enter
          confirm · Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
