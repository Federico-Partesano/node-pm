import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});
vi.mock('simple-git', () => ({
  simpleGit: (cwd: string) => ({
    getConfig: async (_k: string) => {
      const map: Record<string, string> = {
        '/root/g1/repo-a': 'git@github.com:u/repo-a.git',
        '/root/g1/repo-b': 'git@github.com:u/repo-b.git',
      };
      return { value: map[cwd] ?? '' };
    },
  }),
}));

import { ProjectScanner } from '../../src/core/scanner.js';

beforeEach(() => vol.reset());

describe('ProjectScanner', () => {
  it('discovers repos two levels deep', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
      '/root/g1/repo-b/.git/HEAD': 'ref',
      '/root/g1/repo-b/package.json': '{}',
      '/root/notagroup.txt': 'x',
    });
    const scanner = new ProjectScanner();
    const found = await scanner.scan('/root');
    expect(found.map((f) => `${f.group}/${f.name}`).sort()).toEqual([
      'g1/repo-a', 'g1/repo-b',
    ]);
    expect(found[0]?.url).toMatch(/repo-a/);
  });

  it('skips dirs without package.json', async () => {
    vol.fromJSON({
      '/root/g1/notnode/.git/HEAD': 'ref',
    });
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });
});
