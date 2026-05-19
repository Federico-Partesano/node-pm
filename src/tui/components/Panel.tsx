import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';

type Props = {
  title: string;
  subtitle?: string;
  focused?: boolean;
  accent?: 'cyan' | 'magenta' | 'green' | 'yellow' | 'blue';
  children?: ReactNode;
  flexGrow?: number;
  minWidth?: number;
  width?: number;
};

export function Panel({
  title,
  subtitle,
  focused = false,
  accent = 'cyan',
  children,
  flexGrow,
  minWidth,
  width,
}: Props) {
  const borderColor = focused ? accent : 'gray';
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      flexGrow={flexGrow ?? 1}
      minWidth={minWidth}
      width={width}
    >
      <Box>
        <Text bold color={accent}>{focused ? '▎' : ' '}{title}</Text>
        {subtitle && <Text dimColor>  {subtitle}</Text>}
      </Box>
      <Box marginTop={0} flexDirection="column">{children}</Box>
    </Box>
  );
}
