import { describe, it, expect } from 'vitest';
import {
  BlobRefSchema,
  StashEntrySchema,
  ProjectSnapshotSchema,
  SnapshotSchema,
} from '../../src/shared/types.js';

describe('snapshot schemas', () => {
  it('BlobRefSchema requires a 64-char hex blob', () => {
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'a'.repeat(64), size: 1 }).success).toBe(true);
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'zzz', size: 1 }).success).toBe(false);
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'a'.repeat(63), size: 1 }).success).toBe(false);
  });

  it('StashEntrySchema requires message+patch+includesUntracked', () => {
    const ok = StashEntrySchema.safeParse({ message: 'm', patch: 'p', includesUntracked: false });
    expect(ok.success).toBe(true);
  });

  it('ProjectSnapshotSchema accepts a minimal clean project', () => {
    const r = ProjectSnapshotSchema.safeParse({
      name: 'n', group: 'g', url: 'u', branch: 'main', head: 'a'.repeat(40),
      trackedDiff: '', untrackedFiles: [], gitignoredFiles: [], stashes: [],
    });
    expect(r.success).toBe(true);
  });

  it('SnapshotSchema rejects unknown version', () => {
    const r = SnapshotSchema.safeParse({
      version: 2, createdAt: new Date().toISOString(), projects: [],
    });
    expect(r.success).toBe(false);
  });
});
