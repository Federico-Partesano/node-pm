import React from 'react';
import { Box, Text } from 'ink';

type Props = {
  root: string;
  totalProjects: number;
  totalGroups: number;
  activeGroup: string | null;
};

export function Header({ root, totalProjects, totalGroups, activeGroup }: Props) {
  return (
    <Box
      flexDirection="row"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={0}
      justifyContent="space-between"
    >
      <Box flexDirection="column">
        <Text bold color="cyanBright">node-pm</Text>
        <Text dimColor>TUI manager for local Node project repos</Text>
      </Box>
      <Box flexDirection="column" alignItems="flex-end">
        <Text>
          <Text dimColor>root </Text>
          <Text color="white">{root}</Text>
        </Text>
        <Text>
          <Text dimColor>groups </Text>
          <Text color="green">{totalGroups}</Text>
          <Text dimColor>  projects </Text>
          <Text color="green">{totalProjects}</Text>
          {activeGroup && (
            <>
              <Text dimColor>  active </Text>
              <Text color="magenta">{activeGroup}</Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
