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

const pushFn = vi.fn(async () => ({ gistId: 'g', url: 'https://x' }));
const pullFn = vi.fn(async () => ({ version: 1, root: '/r2', concurrency: 5, projects: [] }));
const setTokenFn = vi.fn(async () => undefined);
const getTokenFn = vi.fn(async () => 'tok');
vi.mock('../../src/core/sync.js', () => ({
  GistSync: class {
    push = pushFn;
    pull = pullFn;
    setToken = setTokenFn;
    getToken = getTokenFn;
  },
}));
vi.mock('../../src/core/runner.js', () => ({
  ScriptRunner: class {
    async spawn(p: any, script: string) {
      return {
        id: 'x', project: p, script, status: 'exited', exitCode: 0,
        onStdout: () => () => {}, onStderr: () => () => {}, kill: () => {},
      };
    }
  },
}));

import { runCli } from '../../src/cli/index.js';

beforeEach(async () => {
  vol.reset();
  pushFn.mockClear(); pullFn.mockClear(); setTokenFn.mockClear(); getTokenFn.mockClear();
  await runCli(['node', 'pm', 'init', '--root', '/r']);
  await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
});

describe('CLI aux commands', () => {
  it('sync push calls GistSync.push', async () => {
    await runCli(['node', 'pm', 'sync', 'push']);
    expect(pushFn).toHaveBeenCalled();
  });

  it('sync pull writes the returned manifest', async () => {
    await runCli(['node', 'pm', 'sync', 'pull', 'gid']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/r2');
  });

  it('config set token stores via keyring', async () => {
    await runCli(['node', 'pm', 'config', 'set', 'token', 'abc']);
    expect(setTokenFn).toHaveBeenCalledWith('abc');
  });

  it('config set concurrency updates the manifest', async () => {
    await runCli(['node', 'pm', 'config', 'set', 'concurrency', '8']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.concurrency).toBe(8);
  });

  it('config get root prints the root', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'get', 'root']);
    expect(log).toHaveBeenCalledWith('/r');
    log.mockRestore();
  });
});
