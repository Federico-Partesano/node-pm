import React from 'react';
import { Box } from 'ink';
import { AddProjectForm } from '../components/AddProjectForm.js';
import { Footer, FORM_HINTS } from '../components/Footer.js';

type Props = {
  width: number;
  height: number;
  onDone: () => void;
  onCancel: () => void;
};

export function AddProjectPage({ width, height, onDone, onCancel }: Props) {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexGrow={1}>
        <AddProjectForm onDone={onDone} onCancel={onCancel} />
      </Box>
      <Footer hints={FORM_HINTS} />
    </Box>
  );
}
