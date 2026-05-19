import React from 'react';
import { Box, Text } from 'ink';
import type { SnapshotIndexEntry } from '../hooks/useSnapshotsIndex.js';

type Props = {
  entries: SnapshotIndexEntry[];
  loading: boolean;
  max?: number;
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function ProjectSnapshotsCard({ entries, loading, max = 6 }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        ─ Snapshots ({entries.length})
      </Text>
      {loading && <Text dimColor>scanning snapshotDir…</Text>}
      {!loading && entries.length === 0 && (
        <Text dimColor>no snapshots for this project yet</Text>
      )}
      {entries.slice(0, max).map((e, i) => (
        <Box key={`${e.archivePath}-${i}`}>
          <Text color="cyan">📦 </Text>
          <Text bold>{fmtDate(e.createdAt)}</Text>
          {e.label && <Text color="yellow"> [{e.label}]</Text>}
          <Text dimColor> · </Text>
          <Text color="cyan">{e.branch}</Text>
          <Text dimColor>@</Text>
          <Text>{e.head.slice(0, 7)}</Text>
          <Text dimColor> · {basename(e.archivePath)}</Text>
        </Box>
      ))}
      {entries.length > max && (
        <Text dimColor>…and {entries.length - max} more</Text>
      )}
    </Box>
  );
}
