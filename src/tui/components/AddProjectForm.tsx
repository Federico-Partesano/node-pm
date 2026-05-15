import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import path from 'node:path';
import { ManifestStore } from '../../core/manifest.js';

type Field = 'url' | 'group' | 'saving';

type Props = {
  onDone: () => void;
  onCancel: () => void;
  store?: ManifestStore;
};

function deriveName(url: string): string {
  const base = path.basename(url.trim()).replace(/\.git$/, '');
  return base || 'project';
}

export function AddProjectForm({ onDone, onCancel, store }: Props) {
  const [url, setUrl] = useState('');
  const [group, setGroup] = useState('OSS');
  const [field, setField] = useState<Field>('url');
  const [error, setError] = useState<string | null>(null);
  const storeRef = useRef(store ?? new ManifestStore());

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  if (field === 'saving') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} marginY={1}>
        <Text color="green">Saving project…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginY={1}>
      <Text bold color="cyanBright">Add a project</Text>
      <Box marginTop={1}>
        <Text color={field === 'url' ? 'cyanBright' : 'gray'}>{field === 'url' ? '❯ ' : '  '}</Text>
        <Text dimColor>Git URL: </Text>
        {field === 'url' ? (
          <TextInput
            value={url}
            onChange={setUrl}
            onSubmit={(v) => {
              if (!v.trim()) {
                setError('URL is required');
                return;
              }
              setError(null);
              setField('group');
            }}
          />
        ) : (
          <Text>{url}</Text>
        )}
      </Box>
      <Box>
        <Text color={field === 'group' ? 'cyanBright' : 'gray'}>{field === 'group' ? '❯ ' : '  '}</Text>
        <Text dimColor>Group: </Text>
        {field === 'group' ? (
          <TextInput
            value={group}
            onChange={setGroup}
            onSubmit={(v) => {
              const g = v.trim() || 'OSS';
              setField('saving');
              void storeRef.current
                .addProject({ name: deriveName(url), group: g, url: url.trim() })
                .then(onDone)
                .catch((e: Error) => {
                  setError(e.message);
                  setField('group');
                });
            }}
          />
        ) : (
          <Text>{group}</Text>
        )}
      </Box>
      <Box marginTop={1}><Text dimColor>Enter to advance · Esc to cancel</Text></Box>
      {error && <Box marginTop={1}><Text color="red">{error}</Text></Box>}
    </Box>
  );
}
