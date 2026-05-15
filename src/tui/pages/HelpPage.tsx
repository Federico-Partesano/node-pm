import React from 'react';
import { Box, useInput } from 'ink';
import { EmptyState } from '../components/EmptyState.js';
import { Footer, HELP_HINTS } from '../components/Footer.js';

type Props = {
  width: number;
  height: number;
  root: string;
  onScan: () => void;
  onAddProject: () => void;
};

export function HelpPage({ width, height, root, onScan, onAddProject }: Props) {
  useInput((input) => {
    if (input === 's') onScan();
    if (input === 'n') onAddProject();
  });
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexGrow={1}>
        <EmptyState root={root} />
      </Box>
      <Footer hints={HELP_HINTS} />
    </Box>
  );
}
