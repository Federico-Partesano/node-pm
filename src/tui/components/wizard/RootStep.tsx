import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

type Props = {
  root: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  error: string | null;
};

export function RootStep({ root, onChange, onSubmit, error }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginY={1}>
      <Text bold color="cyanBright">Welcome to node-pm — let&apos;s scan for projects</Text>
      <Box marginTop={1}>
        <Text dimColor>Root directory: </Text>
        <TextInput value={root} onChange={onChange} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}><Text dimColor>Enter to scan · Esc to dismiss</Text></Box>
      <Box marginTop={1}>
        <Text dimColor>Tip: paths are case-sensitive on Linux. Use </Text>
        <Text color="cyan">~/Documents/projects</Text>
        <Text dimColor> or an absolute path.</Text>
      </Box>
      {error && (
        <Box marginTop={1} flexDirection="column">
          {error.split('\n').map((line, i) => (
            <Text key={i} color="red">{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
