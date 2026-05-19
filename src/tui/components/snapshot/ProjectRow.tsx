import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ProgressBar } from './ProgressBar.js';
import type { Project } from '../../../shared/types.js';

export type RowStatus = 'pending' | 'in-progress' | 'done' | 'error';

type Props = {
  project: Project;
  status: RowStatus;
  percent?: number;
  detail?: string;
};

export function ProjectRow({ project, status, percent = 0, detail }: Props) {
  const icon =
    status === 'pending'
      ? '·'
      : status === 'in-progress'
        ? null
        : status === 'done'
          ? '✓'
          : '✗';
  const color =
    status === 'done'
      ? 'green'
      : status === 'error'
        ? 'red'
        : status === 'in-progress'
          ? 'cyan'
          : 'gray';
  return (
    <Box>
      <Box width={3}>
        {icon ? (
          <Text color={color}>{icon}</Text>
        ) : (
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
        )}
      </Box>
      <Box width={28}>
        <Text>
          {project.group}/{project.name}
        </Text>
      </Box>
      {status === 'in-progress' && (
        <>
          <Text> </Text>
          <ProgressBar percent={percent} width={12} />
          <Text> {percent}%</Text>
        </>
      )}
      {detail && <Text dimColor>  {detail}</Text>}
    </Box>
  );
}
