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
      <Panel title="Detail" accent="green">
        <Text dimColor>No project selected</Text>
      </Panel>
    );
  }
  return (
    <Panel title="Detail" subtitle={`${project.group}/${project.name}`} accent="green">
      <Field label="Remote" value={project.url} color="white" />
      <Field label="Path  " value={path ?? '—'} color="white" />
      <Field label="Branch" value={project.defaultBranch ?? '—'} color="cyan" />
      <Field label="PM    " value={pmName ?? '—'} color="yellow" />
      <Box marginTop={1}>
        <Text bold dimColor>Favorite scripts</Text>
      </Box>
      {(project.scripts?.favorites ?? []).length === 0 && (
        <Text dimColor>  none</Text>
      )}
      {(project.scripts?.favorites ?? []).map((s) => (
        <Text key={s}>  <Text color="cyan">▸</Text> {s}</Text>
      ))}
    </Panel>
  );
}

type FieldProps = { label: string; value: string; color?: string };
function Field({ label, value, color }: FieldProps) {
  return (
    <Box>
      <Text dimColor>{label} </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}
