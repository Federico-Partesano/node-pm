import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';

type Props = { done: number; total: number; bytes?: number; title?: string };

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OverallBar({ done, total, bytes = 0, title = 'Overall' }: Props) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Box>
      <Text bold>{title}: </Text>
      <ProgressBar percent={percent} width={20} />
      <Text>  {done}/{total} projects</Text>
      {bytes > 0 && <Text dimColor>  · {fmtBytes(bytes)}</Text>}
    </Box>
  );
}
