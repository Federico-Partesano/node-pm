import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ManifestStore } from '../../core/manifest.js';
import { getDefaultSnapshotDir } from '../../shared/paths.js';

type Props = {
  width: number;
  height: number;
  initialSnapshotDir?: string;
  onExit: () => void;
};

export function SettingsPage({ width, height, initialSnapshotDir, onExit }: Props) {
  const [value, setValue] = useState<string>(
    initialSnapshotDir ?? getDefaultSnapshotDir(),
  );
  const [status, setStatus] = useState<string>('');

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyanBright">
        Settings
      </Text>
      <Box marginTop={1}>
        <Text dimColor>snapshotDir: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={async (v) => {
            const store = new ManifestStore();
            const m = await store.load();
            await store.save({ ...m, snapshotDir: v });
            setStatus(`Saved → ${v}`);
          }}
        />
      </Box>
      {status && (
        <Box marginTop={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Enter save · Esc back</Text>
      </Box>
    </Box>
  );
}
