import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Project } from '../../shared/types.js';

type Props = {
  projects: Project[];
  title?: string;
  onConfirm: (picked: Project[]) => void;
  onCancel: () => void;
};

const keyOf = (p: Project) => `${p.group}/${p.name}`;

export function SnapshotPickerPage({
  projects,
  title = 'Select projects to snapshot',
  onConfirm,
  onCancel,
}: Props) {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const groups = Array.from(new Set(projects.map((p) => p.group))).sort();
  const visible = groupFilter
    ? projects.filter((p) => p.group === groupFilter)
    : projects;

  useInput((input, key) => {
    if (key.escape) return onCancel();
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && cursor > 0) setCursor(cursor - 1);
    if (down && cursor < visible.length - 1) setCursor(cursor + 1);
    if (input === ' ' && visible[cursor]) {
      const k = keyOf(visible[cursor]!);
      const next = new Set(picked);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      setPicked(next);
    }
    if (input === 'a') setPicked(new Set(visible.map(keyOf)));
    if (input === 'A') setPicked(new Set());
    if (input === 'g') {
      // cycle through group filters: null -> g0 -> g1 -> ... -> null
      const idx = groupFilter ? groups.indexOf(groupFilter) : -1;
      const next = idx + 1 < groups.length ? groups[idx + 1] : null;
      setGroupFilter(next);
      setCursor(0);
    }
    if (key.return) {
      const chosen = projects.filter((p) => picked.has(keyOf(p)));
      if (chosen.length > 0) onConfirm(chosen);
    }
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
