import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';
import { PhaseList } from './PhaseList.js';
import { LogTail, type LogLine } from './LogTail.js';
import type { Project } from '../../../shared/types.js';
import type { SnapshotPhase } from '../../../core/snapshot.js';
import type { SnapshotRowState } from '../../hooks/useSnapshotEvents.js';

type Props = {
  project: Project | null;
  row: SnapshotRowState | null;
  phases: SnapshotPhase[];
  log: LogLine[];
  width: number;
  height: number;
  finished: boolean;
  errors: number;
};

export function ActiveProjectCard({
  project,
  row,
  phases,
  log,
  width,
  height,
  finished,
  errors,
}: Props) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={0}
    >
      <Box>
        <Text bold color="cyanBright">
          Active project
        </Text>
        <Box flexGrow={1} />
        {project ? (
          <Text color="yellowBright" bold>
            {project.group}/{project.name}
          </Text>
        ) : (
          <Text dimColor>
            {finished
              ? errors > 0
                ? 'completed with errors'
                : 'completed'
              : 'waiting…'}
          </Text>
        )}
      </Box>

      {project && row ? (
        <>
          <Box marginTop={1}>
            <Text bold>Phase: </Text>
            <Text color="cyanBright">{row.currentPhase ?? '—'}</Text>
          </Box>

          {row.currentFile && (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                <Text bold>Current file: </Text>
                <Text color="yellow">{row.currentFile.path}</Text>
              </Text>
              <Box>
                <ProgressBar percent={row.percent} width={20} />
                <Text>  {row.percent}%</Text>
                <Text dimColor>
                  {' '}
                  ({row.currentFile.current}/{row.currentFile.total})
                </Text>
              </Box>
            </Box>
          )}

          <Box marginTop={1} flexDirection="column">
            <Text bold>Phases:</Text>
            <PhaseList phases={phases} done={row.phasesDone} current={row.currentPhase} />
          </Box>
        </>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>
            {finished
              ? 'All projects processed. Esc to return.'
              : 'Waiting for the next project…'}
          </Text>
        </Box>
      )}

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexDirection="column"
        flexGrow={1}
      >
        <Text bold dimColor>
          Log (last 10)
        </Text>
        <LogTail lines={log} max={10} />
      </Box>
    </Box>
  );
}
