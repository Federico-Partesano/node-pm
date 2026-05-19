import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { Project } from '../../../shared/types.js';
import type { SnapshotRowState } from '../../hooks/useSnapshotEvents.js';

type Props = {
  projects: Project[];
  rows: Map<string, SnapshotRowState>;
  activeKey: string | null;
  width: number;
  height: number;
};

const keyOf = (p: Project) => `${p.group}/${p.name}`;

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ProjectsListCard({ projects, rows, activeKey, width, height }: Props) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
    >
      <Text bold color="cyanBright">
        Projects ({projects.length})
      </Text>
      <Box marginTop={1} flexDirection="column">
        {projects.map((p) => {
          const k = keyOf(p);
          const r = rows.get(k) ?? null;
          const isActive = k === activeKey;
          const status = r?.status ?? 'pending';

          const iconNode =
            status === 'in-progress' ? (
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
            ) : (
              <Text
                color={
                  status === 'done'
                    ? 'green'
                    : status === 'error'
                      ? 'red'
                      : 'gray'
                }
              >
                {status === 'done' ? '✓' : status === 'error' ? '✗' : '·'}
              </Text>
            );

          const nameColor =
            status === 'error'
              ? 'red'
              : status === 'done'
                ? 'green'
                : isActive
                  ? 'cyanBright'
                  : undefined;

          return (
            <Box key={k}>
              <Box width={3}>{iconNode}</Box>
              <Box flexGrow={1}>
                <Text bold={isActive} color={nameColor}>
                  {p.group}/{p.name}
                </Text>
              </Box>
              <Box width={10} justifyContent="flex-end">
                {status === 'done' && r?.bytes !== undefined ? (
                  <Text dimColor>{fmtBytes(r.bytes)}</Text>
                ) : status === 'in-progress' ? (
                  <Text color="cyan">{r?.percent ?? 0}%</Text>
                ) : status === 'error' ? (
                  <Text color="red">error</Text>
                ) : (
                  <Text dimColor>pending</Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
