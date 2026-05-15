import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return { default: fs.promises, ...fs.promises };
});
vi.mock('write-file-atomic', () => ({
  default: async (p: string, data: string) => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
  },
}));
vi.mock('../../src/shared/paths.js', () => ({
  getManifestPath: () => '/cfg/projects.json',
  getDefaultRoot: () => '/Documents/projects',
  expandHome: (s: string) => s,
  getConfigDir: () => '/cfg',
}));

import { ManifestStore } from '../../src/core/manifest.js';

beforeEach(() => vol.reset());

describe('ManifestStore', () => {
  it('returns a default manifest when file is missing', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    expect(m.version).toBe(1);
    expect(m.projects).toEqual([]);
    expect(m.root).toBe('/Documents/projects');
    expect(m.concurrency).toBe(5);
  });

  it('saves and reloads a manifest', async () => {
    const store = new ManifestStore();
    const m = await store.load();
    m.projects.push({ name: 'a', group: 'g', url: 'u' });
    await store.save(m);
    const reloaded = await store.load();
    expect(reloaded.projects).toHaveLength(1);
    expect(reloaded.projects[0]?.name).toBe('a');
  });

  it('addProject appends and deduplicates by name+group', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u1' });
    await store.addProject({ name: 'a', group: 'g', url: 'u2' });
    const m = await store.load();
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]?.url).toBe('u2');
  });

  it('removeProject removes by name+group', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g', url: 'u' });
    await store.addProject({ name: 'b', group: 'g', url: 'u' });
    await store.removeProject('a', 'g');
    const m = await store.load();
    expect(m.projects.map((p) => p.name)).toEqual(['b']);
  });

  it('list filters by group and tag', async () => {
    const store = new ManifestStore();
    await store.addProject({ name: 'a', group: 'g1', url: 'u', tags: ['x'] });
    await store.addProject({ name: 'b', group: 'g2', url: 'u' });
    expect((await store.list({ group: 'g1' })).map((p) => p.name)).toEqual(['a']);
    expect((await store.list({ tag: 'x' })).map((p) => p.name)).toEqual(['a']);
  });

  it('resolvePath joins root/group/name', async () => {
    const store = new ManifestStore();
    await store.load();
    expect(store.resolvePath({ name: 'a', group: 'g', url: 'u' })).toBe(
      path.join('/Documents/projects', 'g', 'a'),
    );
  });

  it('rejects a corrupt manifest with ManifestError', async () => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir('/cfg', { recursive: true });
    await fs.promises.writeFile('/cfg/projects.json', '{invalid');
    const store = new ManifestStore();
    await expect(store.load()).rejects.toThrow(/ManifestError|Manifest|valid JSON/);
  });
});
