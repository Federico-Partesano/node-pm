import React from 'react';
import { Text } from 'ink';

type Props = { percent: number; width: number };

export function ProgressBar({ percent, width }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return (
    <Text>
      {'█'.repeat(filled)}
      {'░'.repeat(empty)}
    </Text>
  );
}
