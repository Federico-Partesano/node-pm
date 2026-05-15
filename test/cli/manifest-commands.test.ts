import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import path from 'node:path';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
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
  getDefaultRoot: () => '/r',
  getConfigDir: () => '/cfg',
  expandHome: (s: string) => s,
}));
vi.mock('../../src/core/scanner.js', () => ({
  ProjectScanner: class {
    async scan() {
      return [
        { name: 'a', group: 'g', url: 'git@x:a/a.git' },
        { name: 'b', group: 'g', url: 'git@x:b/b.git' },
      ];
    }
  },
}));

import { runCli } from '../../src/cli/index.js';

beforeEach(() => vol.reset());

describe('CLI manifest commands', () => {
  it('init creates an empty manifest', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/r');
    expect(m.projects).toEqual([]);
  });

  it('scan populates from filesystem', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'scan']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.map((p: any) => p.name).sort()).toEqual(['a', 'b']);
  });

  it('list --json prints the manifest projects', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'scan']);
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list', '--json']);
    expect(out).toHaveBeenCalled();
    const json = JSON.parse(out.mock.calls.at(-1)![0] as string);
    expect(json).toHaveLength(2);
    out.mockRestore();
  });

  it('add inserts a project', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'c')).toBeTruthy();
  });

  it('rm removes a project', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    await runCli(['node', 'pm', 'rm', 'c']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects).toEqual([]);
  });
});
