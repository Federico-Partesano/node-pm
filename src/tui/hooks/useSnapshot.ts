import { useCallback, useState } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Manifest } from '../../shared/types.js';

export type SnapshotResult = { ok: true; path: string } | { ok: false; error: string };

const DEFAULT_FILENAME = 'node-pm-snapshot.json';

/**
 * Exports the current manifest to a portable JSON snapshot under cwd.
 * Returns the resolved path on success, or an error message.
 */
export function useSnapshot(manifest: Manifest | null) {
  const [last, setLast] = useState<SnapshotResult | null>(null);

  const exportSnapshot = useCallback(async (filename = DEFAULT_FILENAME): Promise<SnapshotResult> => {
    if (!manifest) {
      const r: SnapshotResult = { ok: false, error: 'No manifest loaded' };
      setLast(r);
      return r;
    }
    const target = path.resolve(filename);
    try {
      const { sync: _sync, ...portable } = manifest;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(portable, null, 2));
      const r: SnapshotResult = { ok: true, path: target };
      setLast(r);
      return r;
    } catch (e) {
      const r: SnapshotResult = { ok: false, error: (e as Error).message };
      setLast(r);
      return r;
    }
  }, [manifest]);

  return { exportSnapshot, last };
}
