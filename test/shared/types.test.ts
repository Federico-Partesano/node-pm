import { describe, it, expect } from 'vitest';
import { ManifestSchema, ProjectSchema, SyncStateSchema } from '../../src/shared/types.js';
import type { Project, Manifest, SyncState } from '../../src/shared/types.js';

// ---------------------------------------------------------------------------
// ProjectSchema
// ---------------------------------------------------------------------------

describe('ProjectSchema', () => {
  const valid = {
    name: 'repo-blessed',
    group: 'PERSONALE',
    url: 'git@github.com:user/repo-blessed.git',
  };

  it('accepts a minimal valid project', () => {
    expect(ProjectSchema.safeParse(valid).success).toBe(true);
  });

  // Required fields missing
  it('rejects when name is missing', () => {
    const { name: _n, ...rest } = valid;
    expect(ProjectSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when group is missing', () => {
    const { group: _g, ...rest } = valid;
    expect(ProjectSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when url is missing', () => {
    const { url: _u, ...rest } = valid;
    expect(ProjectSchema.safeParse(rest).success).toBe(false);
  });

  // Empty-string required fields
  it('rejects empty name', () => {
    expect(ProjectSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects empty group', () => {
    expect(ProjectSchema.safeParse({ ...valid, group: '' }).success).toBe(false);
  });

  it('rejects empty url', () => {
    expect(ProjectSchema.safeParse({ ...valid, url: '' }).success).toBe(false);
  });

  // Wrong types for required fields
  it('rejects number as name', () => {
    expect(ProjectSchema.safeParse({ ...valid, name: 42 }).success).toBe(false);
  });

  it('rejects number as group', () => {
    expect(ProjectSchema.safeParse({ ...valid, group: 42 }).success).toBe(false);
  });

  it('rejects number as url', () => {
    expect(ProjectSchema.safeParse({ ...valid, url: 42 }).success).toBe(false);
  });

  // Optional: defaultBranch
  it('accepts valid defaultBranch', () => {
    expect(ProjectSchema.safeParse({ ...valid, defaultBranch: 'main' }).success).toBe(true);
  });

  it('rejects number as defaultBranch', () => {
    expect(ProjectSchema.safeParse({ ...valid, defaultBranch: 123 }).success).toBe(false);
  });

  // Optional: tags
  it('accepts tags as empty array', () => {
    expect(ProjectSchema.safeParse({ ...valid, tags: [] }).success).toBe(true);
  });

  it('accepts tags with string elements', () => {
    expect(ProjectSchema.safeParse({ ...valid, tags: ['ts', 'node'] }).success).toBe(true);
  });

  it('rejects tags with non-string element', () => {
    expect(ProjectSchema.safeParse({ ...valid, tags: ['ts', 42] }).success).toBe(false);
  });

  it('rejects tags that is a string instead of array', () => {
    expect(ProjectSchema.safeParse({ ...valid, tags: 'ts' }).success).toBe(false);
  });

  // Optional: scripts
  it('accepts scripts with favorites undefined', () => {
    expect(ProjectSchema.safeParse({ ...valid, scripts: {} }).success).toBe(true);
  });

  it('accepts scripts with empty favorites array', () => {
    expect(ProjectSchema.safeParse({ ...valid, scripts: { favorites: [] } }).success).toBe(true);
  });

  it('accepts scripts with valid favorites items', () => {
    expect(
      ProjectSchema.safeParse({ ...valid, scripts: { favorites: ['build', 'test'] } }).success,
    ).toBe(true);
  });

  it('rejects scripts.favorites as non-array', () => {
    expect(ProjectSchema.safeParse({ ...valid, scripts: { favorites: 'build' } }).success).toBe(
      false,
    );
  });

  it('rejects scripts.favorites with non-string element', () => {
    expect(
      ProjectSchema.safeParse({ ...valid, scripts: { favorites: ['build', 99] } }).success,
    ).toBe(false);
  });

  // Round-trip
  it('round-trips: parse output matches input', () => {
    const input = { ...valid, tags: ['ts'], defaultBranch: 'main', scripts: { favorites: ['build'] } };
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  // Type inference smoke
  it('type inference: valid object is assignable to Project type', () => {
    const obj: Project = ProjectSchema.parse(valid);
    expect(obj.name).toBe('repo-blessed');
  });
});

// ---------------------------------------------------------------------------
// SyncStateSchema
// ---------------------------------------------------------------------------

describe('SyncStateSchema', () => {
  const validSync = {
    gistId: 'abc123def456',
    lastSync: '2024-01-15T10:30:00.000Z',
  };

  it('accepts a valid sync state', () => {
    expect(SyncStateSchema.safeParse(validSync).success).toBe(true);
  });

  it('rejects when gistId is missing', () => {
    const { gistId: _g, ...rest } = validSync;
    expect(SyncStateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when lastSync is missing', () => {
    const { lastSync: _l, ...rest } = validSync;
    expect(SyncStateSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts empty gistId (schema does not enforce min length)', () => {
    // SyncStateSchema uses z.string() with no min — empty string is valid
    expect(SyncStateSchema.safeParse({ ...validSync, gistId: '' }).success).toBe(true);
  });

  it('rejects lastSync that is not an ISO datetime', () => {
    expect(SyncStateSchema.safeParse({ ...validSync, lastSync: 'not-a-date' }).success).toBe(false);
  });

  it('rejects lastSync as a number', () => {
    expect(SyncStateSchema.safeParse({ ...validSync, lastSync: 1705312200000 }).success).toBe(
      false,
    );
  });

  it('rejects gistId as a number', () => {
    expect(SyncStateSchema.safeParse({ ...validSync, gistId: 999 }).success).toBe(false);
  });

  it('round-trips: parse output matches input', () => {
    const result = SyncStateSchema.safeParse(validSync);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gistId).toBe(validSync.gistId);
      expect(result.data.lastSync).toBe(validSync.lastSync);
    }
  });

  it('type inference: valid object is assignable to SyncState type', () => {
    const obj: SyncState = SyncStateSchema.parse(validSync);
    expect(obj.gistId).toBe('abc123def456');
  });
});

// ---------------------------------------------------------------------------
// ManifestSchema
// ---------------------------------------------------------------------------

describe('ManifestSchema', () => {
  const validProject = {
    name: 'my-repo',
    group: 'work',
    url: 'https://github.com/user/my-repo.git',
  };
  const validManifest = {
    version: 1 as const,
    root: '~/Documents/projects',
    concurrency: 5,
    projects: [],
  };

  it('accepts a minimal valid manifest', () => {
    expect(ManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  // version
  it('accepts version exactly 1', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, version: 1 }).success).toBe(true);
  });

  it('rejects version 0', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, version: 0 }).success).toBe(false);
  });

  it('rejects version 2', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, version: 2 }).success).toBe(false);
  });

  it('rejects version as string "1"', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, version: '1' }).success).toBe(false);
  });

  // root
  it('rejects empty root', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, root: '' }).success).toBe(false);
  });

  it('rejects missing root', () => {
    const { root: _r, ...rest } = validManifest;
    expect(ManifestSchema.safeParse(rest).success).toBe(false);
  });

  // concurrency
  it('defaults concurrency to 5 when not provided', () => {
    const { concurrency: _c, ...rest } = validManifest;
    const result = ManifestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concurrency).toBe(5);
    }
  });

  it('rejects concurrency of 0', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, concurrency: 0 }).success).toBe(false);
  });

  it('rejects negative concurrency', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, concurrency: -1 }).success).toBe(false);
  });

  it('rejects non-integer concurrency', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, concurrency: 2.5 }).success).toBe(false);
  });

  // sync optional
  it('accepts manifest without sync field', () => {
    expect(ManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it('accepts manifest with valid sync', () => {
    const result = ManifestSchema.safeParse({
      ...validManifest,
      sync: { gistId: 'abc123', lastSync: '2024-01-15T10:30:00.000Z' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects manifest with bad lastSync in sync', () => {
    const result = ManifestSchema.safeParse({
      ...validManifest,
      sync: { gistId: 'abc123', lastSync: 'bad-date' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts manifest with empty gistId in sync (schema does not enforce min length)', () => {
    // SyncStateSchema uses z.string() with no min — empty string is valid
    const result = ManifestSchema.safeParse({
      ...validManifest,
      sync: { gistId: '', lastSync: '2024-01-15T10:30:00.000Z' },
    });
    expect(result.success).toBe(true);
  });

  // projects array
  it('accepts empty projects array', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, projects: [] }).success).toBe(true);
  });

  it('accepts projects array with one valid project', () => {
    expect(
      ManifestSchema.safeParse({ ...validManifest, projects: [validProject] }).success,
    ).toBe(true);
  });

  it('rejects when projects is not an array', () => {
    expect(ManifestSchema.safeParse({ ...validManifest, projects: 'none' }).success).toBe(false);
  });

  it('rejects when projects contains an invalid project', () => {
    expect(
      ManifestSchema.safeParse({ ...validManifest, projects: [{ name: '', group: 'g', url: 'u' }] })
        .success,
    ).toBe(false);
  });

  // Round-trip
  it('round-trips: parse output matches input', () => {
    const input = { ...validManifest, projects: [validProject] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.root).toBe(input.root);
      expect(result.data.projects).toHaveLength(1);
    }
  });

  // Type inference smoke
  it('type inference: valid object is assignable to Manifest type', () => {
    const obj: Manifest = ManifestSchema.parse(validManifest);
    expect(obj.version).toBe(1);
  });
});
