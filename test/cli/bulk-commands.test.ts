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

const cloneCalls: string[] = [];
const pullCalls: string[] = [];
const statusCalls: string[] = [];
vi.mock('../../src/core/git.js', () => ({
  GitOps: class {
    async *clone(_url: string, dest: string) { cloneCalls.push(dest); yield { phase: 'cloning', percent: 100 }; }
    async pull(p: string) { pullCalls.push(p); return { changes: 0, insertions: 0, deletions: 0 }; }
    async status(p: string) { statusCalls.push(p); return { branch: 'main', dirty: false, ahead: 0, behind: 0, exists: true }; }
    async fetch() {}
  },
}));
vi.mock('../../src/core/pm.js', () => ({
  PackageManager: class {
    async detect() { return 'npm' as const; }
    async *install() { yield { phase: 'install', message: 'ok' }; }
  },
}));

import { runCli } from '../../src/cli/index.js';

beforeEach(async () => {
  vol.reset();
  cloneCalls.length = 0; pullCalls.length = 0; statusCalls.length = 0;
  await runCli(['node', 'pm', 'init', '--root', '/r']);
  await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
  await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
});

describe('CLI bulk commands', () => {
  it('clone --all clones every project', async () => {
    await runCli(['node', 'pm', 'clone', '--all']);
    expect(cloneCalls.sort()).toEqual([path.join('/r','g','a'), path.join('/r','g','b')]);
  });

  it('pull --all pulls every project', async () => {
    await runCli(['node', 'pm', 'pull', '--all']);
    expect(pullCalls).toHaveLength(2);
  });

  it('status --all reports each project', async () => {
    await runCli(['node', 'pm', 'status', '--all']);
    expect(statusCalls).toHaveLength(2);
  });

  it('install --all runs install on every project', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'install', '--all']);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
