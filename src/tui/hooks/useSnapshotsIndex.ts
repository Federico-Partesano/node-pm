import { useEffect, useState } from 'react';
import { scanForSnapshots } from '../../core/snapshot-scanner.js';
import { openZipBlobStoreReader, openDirBlobStoreReader } from '../../core/blob-store.js';
import { SnapshotSchema } from '../../shared/types.js';

export type SnapshotIndexEntry = {
  /** absolute path to the .npmsnap (or snapshot dir) */
  archivePath: string;
  createdAt: string;
  label?: string;
  /** sha40 HEAD of the project entry within this snapshot */
  head: string;
  branch: string;
  bytes?: number;
};

export type SnapshotIndex = Map<string, SnapshotIndexEntry[]>;

const keyFor = (group: string, name: string) => `${group}/${name}`;

async function loadOne(path: string): Promise<{ raw: string } | null> {
  try {
    const reader = path.endsWith('.npmsnap')
      ? await openZipBlobStoreReader(path)
      : await openDirBlobStoreReader(path);
    const raw = await reader.readMetadata('snapshot.json');
    await reader.close();
    return { raw };
  } catch {
    return null;
  }
}

export function useSnapshotsIndex(snapshotDir: string | null) {
  const [index, setIndex] = useState<SnapshotIndex>(new Map());
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!snapshotDir) {
      setIndex(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const files = await scanForSnapshots(snapshotDir);
      const next: SnapshotIndex = new Map();
      for (const f of files) {
        const meta = await loadOne(f);
        if (!meta) continue;
        let parsed;
        try {
          parsed = SnapshotSchema.parse(JSON.parse(meta.raw));
        } catch {
          continue;
        }
        for (const proj of parsed.projects) {
          const k = keyFor(proj.group, proj.name);
          const arr = next.get(k) ?? [];
          arr.push({
            archivePath: f,
            createdAt: parsed.createdAt,
            label: parsed.label,
            head: proj.head,
            branch: proj.branch,
          });
          next.set(k, arr);
        }
      }
      // newest first
      for (const arr of next.values()) {
        arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      }
      if (!cancelled) {
        setIndex(next);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshotDir, refreshTick]);

  return {
    index,
    loading,
    refresh: () => setRefreshTick((t) => t + 1),
  };
}
