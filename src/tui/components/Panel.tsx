import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';

type Props = {
  title: string;
  focused?: boolean;
  children?: ReactNode;
};

export function Panel({ title, focused = false, children }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1}>
      <Text bold color="cyan">{title}</Text>
      {children}
    </Box>
  );
}
