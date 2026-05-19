import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';

type Props = {
  mode: 'create' | 'restore';
  total: number;
  done: number;
  errors: number;
  warnings: number;
  bytes: number;
  outputPath: string | null;
  finished: boolean;
};

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SnapshotHeaderCard({
  mode,
  total,
  done,
  errors,
  warnings,
  bytes,
  outputPath,
  finished,
}: Props) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const title = mode === 'create' ? '📦  Creating snapshot' : '♻️   Restoring snapshot';
  const borderColor = finished
    ? errors > 0
      ? 'yellow'
      : 'green'
    : 'cyan';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={2}
      paddingY={0}
    >
      <Box>
        <Text bold color={finished ? (errors > 0 ? 'yellowBright' : 'greenBright') : 'cyanBright'}>
          {title}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>{finished ? 'Done' : 'In progress'}</Text>
      </Box>
      <Box marginTop={0}>
        <Text bold>Overall: </Text>
        <ProgressBar percent={percent} width={28} />
        <Text>  {percent}%</Text>
        <Text dimColor>  ·  </Text>
        <Text color="green">{done} done</Text>
        <Text dimColor>  ·  </Text>
        <Text color={errors > 0 ? 'red' : 'gray'}>{errors} errors</Text>
        <Text dimColor>  ·  </Text>
        <Text color={warnings > 0 ? 'yellow' : 'gray'}>{warnings} warnings</Text>
        <Text dimColor>  ·  </Text>
        <Text>{fmtBytes(bytes)}</Text>
        <Text dimColor>  /  </Text>
        <Text>{done}/{total}</Text>
      </Box>
      {outputPath && (
        <Box>
          <Text dimColor>Output: </Text>
          <Text>{outputPath}</Text>
        </Box>
      )}
    </Box>
  );
}
