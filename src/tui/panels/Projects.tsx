import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { GitStatus, Project } from '../../shared/types.js';
import { Panel } from '../components/Panel.js';

type Props = {
  projects: Project[];
  statusByName: Map<string, GitStatus>;
  selected: Set<string>;
  cursor: string | null;
  focused: boolean;
  onCursor: (name: string) => void;
  onToggle: (name: string) => void;
};

export const Projects = React.memo(ProjectsImpl);
function ProjectsImpl({ projects, statusByName, selected, cursor, focused, onCursor, onToggle }: Props) {
  useInput((input, key) => {
    if (!focused) return;
    const idx = projects.findIndex((p) => p.name === cursor);
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && idx > 0) onCursor(projects[idx - 1]!.name);
    if (down && idx < projects.length - 1) onCursor(projects[idx + 1]!.name);
    if (input === ' ' && cursor) onToggle(cursor);
  }, { isActive: focused });

  return (
    <Panel
      title="Projects"
      subtitle={`${selected.size}/${projects.length} selected`}
      focused={focused}
      accent="cyan"
    >
      {projects.length === 0 && <Text dimColor>No projects in this group</Text>}
      {projects.map((p) => {
        const sel = selected.has(p.name);
        const onCursorRow = p.name === cursor;
        const s = statusByName.get(p.name);
        return (
          <Box key={p.name}>
            <Text color={onCursorRow ? 'cyanBright' : 'gray'}>{onCursorRow ? '❯ ' : '  '}</Text>
            <Text color={sel ? 'green' : 'gray'}>{sel ? '◉' : '○'}</Text>
            <Text> </Text>
            <Text color={onCursorRow ? 'whiteBright' : undefined} bold={onCursorRow}>
              {p.name.padEnd(22)}
            </Text>
            <Text> </Text>
            <StatusBadge status={s} />
          </Box>
        );
      })}
    </Panel>
  );
}

function StatusBadge({ status }: { status?: GitStatus }) {
  if (!status) return <Text dimColor>…</Text>;
  if (!status.exists) return <Text color="yellow">⚠ missing</Text>;
  const parts: React.ReactNode[] = [];
  if (status.dirty) parts.push(<Text key="d" color="red">● dirty</Text>);
  if (status.ahead) parts.push(<Text key="a" color="cyan">↑{status.ahead}</Text>);
  if (status.behind) parts.push(<Text key="b" color="magenta">↓{status.behind}</Text>);
  if (parts.length === 0) parts.push(<Text key="c" color="green">✓ clean</Text>);
  return (
    <Text>
      {parts.map((p, i) => (
        <Text key={i}>{i > 0 ? ' ' : ''}{p}</Text>
      ))}
    </Text>
  );
}
