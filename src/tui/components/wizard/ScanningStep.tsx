import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { DiscoveredProject } from '../../../shared/types.js';

type Props = {
  root: string;
  current: string;
  found: DiscoveredProject[];
};

export function ScanningStep({ root, current, found }: Props) {
  const tail = found.slice(-10);
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} marginY={1}>
      <Text>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text bold> Scanning </Text>
        <Text dimColor>{root}</Text>
      </Text>
      <Box marginTop={1}>
        <Text dimColor>Currently scanning: </Text>
        <Text>{current || '(starting…)'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Found so far: </Text>
        <Text color="green">{found.length}</Text>
        <Text dimColor> project(s)</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {tail.map((p) => (
          <Text key={`${p.group}/${p.name}`} color="green">  ✓ {p.group}/{p.name}</Text>
        ))}
      </Box>
      <Box marginTop={1}><Text dimColor>Esc to cancel</Text></Box>
    </Box>
  );
}
