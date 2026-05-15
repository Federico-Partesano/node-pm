import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function SavingStep({ count }: { count: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} marginY={1}>
      <Text>
        <Text color="green"><Spinner type="dots" /></Text>
        <Text> Saving </Text>
        <Text bold>{count}</Text>
        <Text> project(s) to manifest…</Text>
      </Text>
    </Box>
  );
}
