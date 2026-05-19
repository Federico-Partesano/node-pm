import { useMemo } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { GitOps } from '../../core/git.js';
import { SnapshotEngine, type SnapshotEvent } from '../../core/snapshot.js';
import {
  openZipBlobStoreReader,
  openZipBlobStoreWriter,
  openDirBlobStoreReader,
  openDirBlobStoreWriter,
} from '../../core/blob-store.js';
import { expandHome, getDefaultSnapshotDir } from '../../shared/paths.js';
import type { Manifest, Project } from '../../shared/types.js';

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function useSnapshotRun(manifest: Manifest | null) {
  const engine = useMemo(() => {
    if (!manifest) return null;
    return new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) =>
        p.endsWith('.npmsnap') ? openZipBlobStoreWriter(p) : openDirBlobStoreWriter(p),
      openReader: (p) =>
        p.endsWith('.npmsnap') ? openZipBlobStoreReader(p) : openDirBlobStoreReader(p),
      resolveProjectPath: (_root, proj) =>
        path.join(expandHome(manifest.root), proj.group, proj.name),
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });
  }, [manifest]);

  return {
    engine,
    async startCreate(
      projects: Project[],
    ): Promise<{ iterable: AsyncIterable<SnapshotEvent>; outPath: string }> {
      if (!manifest || !engine) throw new Error('No manifest');
      const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `${ts()}.npmsnap`);
      const iterable = engine.create({
        projects,
        rootDir: manifest.root,
        snapshotPath: outPath,
      });
      return { iterable, outPath };
    },
  };
}
