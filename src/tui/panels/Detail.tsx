import React from 'react';
import { Box, Text } from 'ink';
import type { PMName, Project } from '../../shared/types.js';
import { Panel } from '../components/Panel.js';

type Props = {
  project: Project | null;
  path: string | null;
  pmName: PMName | null;
};

export function Detail({ project, path, pmName }: Props) {
  if (!project) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>No project selected</Text>
      </Box>
    );
  }
  return (
    <Panel title={`${project.group}/${project.name}`}>
      <Text>Path:   {path ?? '-'}</Text>
      <Text>Remote: {project.url}</Text>
      <Text>PM:     {pmName ?? '-'}</Text>
      <Text bold>Scripts:</Text>
      {(project.scripts?.favorites ?? []).map((s) => (
        <Text key={s}>  • {s}</Text>
      ))}
    </Panel>
  );
}
