import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return { default: fs.promises, ...fs.promises };
});

const writeFileAtomicMock = vi.fn(async (p: string, data: string) => {
  const { fs } = await import('memfs');
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, data);
});
vi.mock('write-file-atomic', () => ({
  default: (...args: Parameters<typeof writeFileAtomicMock>) => writeFileAtomicMock(...args),
}));
vi.mock('../../src/shared/paths.js', () => ({
  getManifestPath: () => '/cfg/projects.json',
  getDefaultRoot: () => '/Documents/projects',
  expandHome: (s: string) => (s.startsWith('~/') ? '/home/user' + s.slice(1) : s),
  getConfigDir: () => '/cfg',
}));

import { ManifestStore } from '../../src/core/manifest.js';
import { ManifestError } from '../../src/shared/errors.js';
import type { Manifest } from '../../src/shared/types.js';

beforeEach(() => {
  vol.reset();
  writeFileAtomicMock.mockClear();
});

// ─── load() ──────────────────────────────────────────────────────────────────

describe('load()', () => {
  it('ENOENT path returns default manifest with version=1, root=getDefaultRoot, concurrency=5, projects=[]', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    expect(m.version).toBe(1);
    expect(m.root).toBe('/Documents/projects');
    expect(m.concurrency).toBe(5);
    expect(m.projects).toEqual([]);
  });

  it('file exists with valid manifest → returns parsed data', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '/my/root', concurrency: 3, projects: [{ name: 'x', group: 'y', url: 'z' }] }),
    );
    const store = new ManifestStore();
    const m = await store.load();
    expect(m.version).toBe(1);
    expect(m.root).toBe('/my/root');
    expect(m.concurrency).toBe(3);
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]?.name).toBe('x');
  });

  it('file with valid JSON but missing concurrency → defaults to 5', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '/r', projects: [] }),
    );
    const store = new ManifestStore();
    const m = await store.load();
    expect(m.concurrency).toBe(5);
  });

  it('file with invalid JSON → throws ManifestError with code E_MANIFEST_PARSE', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile('/cfg/projects.json', '{invalid json!!!');
    const store = new ManifestStore();
    await expect(store.load()).rejects.toSatisfy(
      (e: unknown) => e instanceof ManifestError && (e as ManifestError).code === 'E_MANIFEST_PARSE',
    );
  });

  it('invalid JSON → backup file written with .bak.<timestamp> suffix', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile('/cfg/projects.json', '{bad');
    const store = new ManifestStore();
    const before = Date.now();
    await store.load().catch(() => {});
    const after = Date.now();
    const files = await fs.promises.readdir('/cfg');
    const baks = (files as string[]).filter((f) => f.startsWith('projects.json.bak.'));
    expect(baks).toHaveLength(1);
    const ts = parseInt(baks[0]!.split('.bak.')[1]!, 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('file with valid JSON but invalid schema → throws ManifestError code E_MANIFEST_SCHEMA', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    // missing required fields (no version, no projects)
    await fs.promises.writeFile('/cfg/projects.json', JSON.stringify({ foo: 'bar' }));
    const store = new ManifestStore();
    await expect(store.load()).rejects.toSatisfy(
      (e: unknown) => e instanceof ManifestError && (e as ManifestError).code === 'E_MANIFEST_SCHEMA',
    );
  });

  it('file with version=99 → throws ManifestError code E_MANIFEST_SCHEMA (literal mismatch)', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 99, root: '/r', concurrency: 5, projects: [] }),
    );
    const store = new ManifestStore();
    await expect(store.load()).rejects.toSatisfy(
      (e: unknown) => e instanceof ManifestError && (e as ManifestError).code === 'E_MANIFEST_SCHEMA',
    );
  });

  it('read permission error (EACCES) → throws ManifestError code E_MANIFEST_READ with cause preserved', async () => {
    // Simulate EACCES by mocking readFile to throw EACCES
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile('/cfg/projects.json', '{}');
    const origReadFile = fs.promises.readFile.bind(fs.promises);
    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockImplementationOnce(() => {
      const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      return Promise.reject(err);
    });
    const store = new ManifestStore();
    const caught = await store.load().catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ManifestError);
    expect((caught as ManifestError).code).toBe('E_MANIFEST_READ');
    expect((caught as ManifestError).cause).toBeDefined();
    expect(((caught as ManifestError).cause as Error).message).toMatch(/Permission denied/);
    readFileSpy.mockRestore();
    void origReadFile;
  });

  it('multiple load() calls return the same cached instance (identity)', async () => {
    const store = new ManifestStore();
    const m1 = await store.load();
    const m2 = await store.load();
    expect(m1).toBe(m2);
  });

  it('after save(), load() returns the saved data', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    m.projects.push({ name: 'saved', group: 'g', url: 'u' });
    await store.save(m);
    const reloaded = await store.load();
    expect(reloaded.projects).toHaveLength(1);
    expect(reloaded.projects[0]?.name).toBe('saved');
  });

  it('invalidate() clears cache; next load() re-reads file', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '/r', concurrency: 5, projects: [] }),
    );
    const store = new ManifestStore();
    const first = await store.load();
    expect(first.projects).toHaveLength(0);

    // Update the file on disk directly
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '/r', concurrency: 5, projects: [{ name: 'new', group: 'g', url: 'u' }] }),
    );

    // Without invalidate, still cached
    const stillCached = await store.load();
    expect(stillCached.projects).toHaveLength(0);

    store.invalidate();
    const fresh = await store.load();
    expect(fresh.projects).toHaveLength(1);
    expect(fresh.projects[0]?.name).toBe('new');
  });
});

// ─── save() ──────────────────────────────────────────────────────────────────

describe('save()', () => {
  it('creates config dir if missing', async () => {
    const { fs } = await import('memfs');
    const store = new ManifestStore();
    const m = await store.load();
    await store.save(m);
    const stat = await fs.promises.stat('/cfg');
    expect(stat.isDirectory()).toBe(true);
  });

  it('persists JSON formatted with 2-space indent', async () => {
    const { fs } = await import('memfs');
    const store = new ManifestStore();
    const m = await store.load();
    await store.save(m);
    const raw = await fs.promises.readFile('/cfg/projects.json', 'utf8') as string;
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
    // Verify actual 2-space indent is present in the string
    expect(raw).toMatch(/\n  /);
  });

  it('writes through write-file-atomic (mock is called with correct path)', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    await store.save(m);
    expect(writeFileAtomicMock).toHaveBeenCalledWith('/cfg/projects.json', expect.any(String));
  });

  it('validates manifest before save → throws ZodError on invalid data (version=2)', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    // Force invalid version via type cast
    const bad = { ...m, version: 2 } as unknown as Manifest;
    await expect(store.save(bad)).rejects.toThrow();
  });

  it('after save, cache is updated to the saved data (load returns it without re-reading disk)', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    const updated = { ...m, root: '/updated/root' };
    await store.save(updated);
    const cached = await store.load();
    expect(cached.root).toBe('/updated/root');
    // write-file-atomic was called once (from save), not again from load
    expect(writeFileAtomicMock).toHaveBeenCalledTimes(1);
  });
});

// ─── addProject() ─────────────────────────────────────────────────────────────

describe('addProject()', () => {
  it('adds new project at end', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u1' });
    await store.addProject({ name: 'b', group: 'g', url: 'u2' });
    const m = await store.load();
    expect(m.projects.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('replaces project with same name+group (dedup)', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u1' });
    await store.addProject({ name: 'a', group: 'g', url: 'u2' });
    const m = await store.load();
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]?.url).toBe('u2');
  });

  it('different group with same name keeps both', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u1' });
    await store.addProject({ name: 'a', group: 'g2', url: 'u2' });
    const m = await store.load();
    expect(m.projects).toHaveLength(2);
    expect(m.projects.map((p) => p.group)).toEqual(['g1', 'g2']);
  });

  it('project with empty name → throws (zod validation in save)', async () => {
    const store = new ManifestStore();
    await expect(
      store.addProject({ name: '', group: 'g', url: 'u' }),
    ).rejects.toThrow();
  });

  it('save error during add → cache does NOT contain unsaved mutation', async () => {
    const store = new ManifestStore();
    // Load initial empty state
    await store.load();

    // Make the next writeFileAtomic call fail
    writeFileAtomicMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      store.addProject({ name: 'doomed', group: 'g', url: 'u' }),
    ).rejects.toThrow('disk full');

    // Load should still show empty (save failed, cache was not updated)
    // invalidate to force re-read from disk (which still has original data)
    store.invalidate();
    const m = await store.load();
    expect(m.projects).toHaveLength(0);
  });
});

// ─── removeProject() ──────────────────────────────────────────────────────────

describe('removeProject()', () => {
  it('removes only matching name+group, not by name alone', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u1' });
    await store.addProject({ name: 'a', group: 'g2', url: 'u2' });
    await store.removeProject('a', 'g1');
    const m = await store.load();
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]?.group).toBe('g2');
  });

  it('removing non-existent project is a no-op (no throw)', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u' });
    await expect(store.removeProject('nonexistent', 'g')).resolves.toBeUndefined();
    const m = await store.load();
    expect(m.projects).toHaveLength(1);
  });

  it('removing one of duplicates by group keeps the other', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'x', group: 'g1', url: 'u1' });
    await store.addProject({ name: 'x', group: 'g2', url: 'u2' });
    await store.removeProject('x', 'g1');
    const m = await store.load();
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]?.url).toBe('u2');
  });

  it('re-loading after remove shows the deletion (persisted to disk)', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'del', group: 'g', url: 'u' });
    await store.removeProject('del', 'g');

    // Verify disk state by creating a new store instance (no shared cache)
    const store2 = new ManifestStore();
    const m = await store2.load();
    expect(m.projects.find((p) => p.name === 'del')).toBeUndefined();
  });
});

// ─── list() ───────────────────────────────────────────────────────────────────

describe('list()', () => {
  it('no filter returns all projects', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u' });
    await store.addProject({ name: 'b', group: 'g2', url: 'u' });
    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it('filter by group keeps only matching', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u' });
    await store.addProject({ name: 'b', group: 'g2', url: 'u' });
    const filtered = await store.list({ group: 'g1' });
    expect(filtered.map((p) => p.name)).toEqual(['a']);
  });

  it('filter by tag keeps only those with that tag', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u', tags: ['react', 'ts'] });
    await store.addProject({ name: 'b', group: 'g', url: 'u', tags: ['vue'] });
    await store.addProject({ name: 'c', group: 'g', url: 'u' });
    const filtered = await store.list({ tag: 'react' });
    expect(filtered.map((p) => p.name)).toEqual(['a']);
  });

  it('filter by group+tag is AND (both must match)', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u', tags: ['ts'] });
    await store.addProject({ name: 'b', group: 'g1', url: 'u', tags: ['js'] });
    await store.addProject({ name: 'c', group: 'g2', url: 'u', tags: ['ts'] });
    const filtered = await store.list({ group: 'g1', tag: 'ts' });
    expect(filtered.map((p) => p.name)).toEqual(['a']);
  });

  it('empty manifest returns []', async () => {
    const store = new ManifestStore();
    const all = await store.list();
    expect(all).toEqual([]);
  });

  it('tags undefined on a project → tag filter excludes it', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'notag', group: 'g', url: 'u' }); // no tags field
    await store.addProject({ name: 'tagged', group: 'g', url: 'u', tags: ['x'] });
    const filtered = await store.list({ tag: 'x' });
    expect(filtered.map((p) => p.name)).toEqual(['tagged']);
  });
});

// ─── resolvePath() ────────────────────────────────────────────────────────────

describe('resolvePath()', () => {
  it('joins root/group/name with path.join', async () => {
    const store = new ManifestStore();
    await store.load();
    const result = store.resolvePath({ name: 'my-proj', group: 'work', url: 'u' });
    expect(result).toBe(path.join('/Documents/projects', 'work', 'my-proj'));
  });

  it('throws ManifestError E_MANIFEST_NOT_LOADED if cache is null', () => {
    const store = new ManifestStore(); // never loaded
    expect(() => store.resolvePath({ name: 'a', group: 'g', url: 'u' })).toSatisfy(
      (_thrown: unknown) => {
        try {
          store.resolvePath({ name: 'a', group: 'g', url: 'u' });
          return false;
        } catch (e) {
          return e instanceof ManifestError && (e as ManifestError).code === 'E_MANIFEST_NOT_LOADED';
        }
      },
    );
  });

  it('after load, returns expected path', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '/custom/root', concurrency: 5, projects: [] }),
    );
    const store = new ManifestStore();
    await store.load();
    const p = store.resolvePath({ name: 'proj', group: 'grp', url: 'u' });
    expect(p).toBe(path.join('/custom/root', 'grp', 'proj'));
  });

  it('tilde in root is expanded via expandHome', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile(
      '/cfg/projects.json',
      JSON.stringify({ version: 1, root: '~/code', concurrency: 5, projects: [] }),
    );
    const store = new ManifestStore();
    await store.load();
    const p = store.resolvePath({ name: 'app', group: 'personal', url: 'u' });
    // expandHome mock: ~/... → /home/user/...
    expect(p).toBe(path.join('/home/user/code', 'personal', 'app'));
  });

  it('project with special chars in name (dots, hyphens) is preserved', async () => {
    const store = new ManifestStore();
    await store.load();
    const p = store.resolvePath({ name: 'my.proj-v2', group: 'work-team', url: 'u' });
    expect(p).toBe(path.join('/Documents/projects', 'work-team', 'my.proj-v2'));
  });

  it('throws ManifestError E_MANIFEST_NOT_LOADED directly (not inside callback)', () => {
    const store = new ManifestStore();
    let caught: unknown;
    try {
      store.resolvePath({ name: 'a', group: 'g', url: 'u' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ManifestError);
    expect((caught as ManifestError).code).toBe('E_MANIFEST_NOT_LOADED');
  });
});
