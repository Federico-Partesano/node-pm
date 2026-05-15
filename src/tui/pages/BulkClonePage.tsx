import React from 'react';
import { Box } from 'ink';
import { BulkCloneForm, type ParsedEntry } from '../components/BulkCloneForm.js';
import { Footer, BULK_CLONE_HINTS } from '../components/Footer.js';

type Props = {
  width: number;
  height: number;
  defaultGroup: string;
  onSubmit: (entries: ParsedEntry[]) => void;
  onCancel: () => void;
};

export function BulkClonePage({ width, height, defaultGroup, onSubmit, onCancel }: Props) {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexGrow={1}>
        <BulkCloneForm defaultGroup={defaultGroup} onSubmit={onSubmit} onCancel={onCancel} />
      </Box>
      <Footer hints={BULK_CLONE_HINTS} />
    </Box>
  );
}
