import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

type Props = {
  defaultGroup: string;
  onSubmit: (entries: ParsedEntry[]) => void;
  onCancel: () => void;
};

export type ParsedEntry = { url: string; name: string; group: string };

export function BulkCloneForm({ defaultGroup, onSubmit, onCancel }: Props) {
  const [group, setGroup] = useState(defaultGroup || 'OSS');
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [field, setField] = useState<'group' | 'url'>('url');
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) onCancel();
    if (key.tab) setField((f) => (f === 'group' ? 'url' : 'group'));
    // Submit with Ctrl+D
    if (key.ctrl && _input === 'd') {
      if (urls.length === 0 && urlInput.trim()) {
        // user typed something but didn't press Enter — accept it
        const parsed = parseEntries([urlInput.trim()], group);
        if (parsed.length > 0) onSubmit(parsed);
        return;
      }
      if (urls.length === 0) {
        setError('Add at least one URL (Enter to confirm a line, then Ctrl+D to submit)');
        return;
      }
      onSubmit(parseEntries(urls, group));
    }
    // Backspace on empty url field removes last URL
    if (key.backspace && field === 'url' && urlInput === '' && urls.length > 0) {
      setUrls((u) => u.slice(0, -1));
    }
  });

  const handleUrlSubmit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!looksLikeGitUrl(trimmed)) {
      setError(`Not a git URL: ${trimmed}`);
      return;
    }
    setError(null);
    setUrls((u) => [...u, trimmed]);
    setUrlInput('');
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginY={1}>
      <Text bold color="cyanBright">Bulk clone — paste git URLs</Text>

      <Box marginTop={1}>
        <Text dimColor>Group: </Text>
        {field === 'group' ? (
          <TextInput value={group} onChange={setGroup} onSubmit={() => setField('url')} />
        ) : (
          <Text color="magenta">{group}</Text>
        )}
        <Text dimColor>  (Tab to edit)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>URLs queued ({urls.length}):</Text>
        {urls.length === 0 && <Text dimColor>  (none yet)</Text>}
        {urls.map((u, i) => (
          <Text key={i} color="green">  ✓ {u}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>URL: </Text>
        {field === 'url' ? (
          <TextInput
            value={urlInput}
            onChange={setUrlInput}
            onSubmit={handleUrlSubmit}
            placeholder="git@github.com:user/repo.git or https://…"
          />
        ) : (
          <Text dimColor>(Tab to edit)</Text>
        )}
      </Box>

      <Box marginTop={1}><Text dimColor>Enter adds line · Backspace on empty removes last · Ctrl+D submits · Esc cancels</Text></Box>
      {error && <Box marginTop={1}><Text color="red">{error}</Text></Box>}
    </Box>
  );
}

function looksLikeGitUrl(s: string): boolean {
  return (
    s.startsWith('git@') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('ssh://') ||
    s.startsWith('git://') ||
    s.endsWith('.git')
  );
}

function deriveName(url: string): string {
  const last = url.split(/[/:]/).pop() ?? url;
  return last.replace(/\.git$/, '') || 'repo';
}

function parseEntries(urls: string[], group: string): ParsedEntry[] {
  return urls.map((url) => ({
    url,
    name: deriveName(url),
    group,
  }));
}

export { deriveName as deriveBulkCloneName };
