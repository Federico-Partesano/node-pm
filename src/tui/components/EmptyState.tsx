import React from 'react';
import { Box, Text } from 'ink';

type Props = { root: string };

export function EmptyState({ root }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={3}
      paddingY={1}
      marginY={1}
    >
      <Text bold color="yellow">No projects in manifest</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Two ways to populate the manifest at:</Text>
        <Text>{'  '}<Text color="white">{root}</Text></Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="green">  1. </Text>
          <Text bold>Auto scan</Text>
          <Text dimColor> — discover existing repos under the root:</Text>
        </Text>
        <Text>{'     '}<Text color="cyan">pm scan</Text></Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="green">  2. </Text>
          <Text bold>Add one by one</Text>
          <Text dimColor> — explicit URL + group:</Text>
        </Text>
        <Text>{'     '}<Text color="cyan">pm add &lt;git-url&gt; --group &lt;name&gt;</Text></Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Then re-launch the TUI with </Text>
        <Text color="cyan">npm start</Text>
        <Text dimColor> or </Text>
        <Text color="cyan">node dist/index.js</Text>
        <Text dimColor>.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text bold color="yellow">s</Text>
        <Text dimColor> to start the scan wizard, </Text>
        <Text bold color="yellow">n</Text>
        <Text dimColor> to add one project.</Text>
      </Box>
    </Box>
  );
}
