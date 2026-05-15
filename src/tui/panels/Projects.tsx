import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { GitStatus, Project } from '../../shared/types.js';

type Props = {
  projects: Project[];
  statusByName: Map<string, GitStatus>;
  selected: Set<string>;
  cursor: string | null;
  focused: boolean;
  onCursor: (name: string) => void;
  onToggle: (name: string) => void;
};

export function Projects({ projects, statusByName, selected, cursor, focused, onCursor, onToggle }: Props) {
  useInput((input, key) => {
    if (!focused) return;
    const idx = projects.findIndex((p) => p.name === cursor);
    if (key.upArrow && idx > 0) onCursor(projects[idx - 1]!.name);
    if (key.downArrow && idx < projects.length - 1) onCursor(projects[idx + 1]!.name);
    if (input === ' ' && cursor) onToggle(cursor);
  }, { isActive: focused });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1}>
      <Text bold color="cyan">Projects</Text>
      {projects.map((p) => {
        const sel = selected.has(p.name);
        const onCursorRow = p.name === cursor;
        const s = statusByName.get(p.name);
        const badge = badgeFor(s);
        return (
          <Text key={p.name} color={onCursorRow ? 'green' : undefined}>
            {sel ? '[x] ' : '[ ] '}{p.name.padEnd(20)} {badge}
          </Text>
        );
      })}
    </Box>
  );
}

function badgeFor(s?: GitStatus): string {
  if (!s) return '...';
  if (!s.exists) return '⚠missing';
  const parts: string[] = [];
  if (s.dirty) parts.push('●dirty');
  if (s.ahead) parts.push(`↑${s.ahead}`);
  if (s.behind) parts.push(`↓${s.behind}`);
  if (parts.length === 0) parts.push('clean');
  return parts.join(' ');
}
