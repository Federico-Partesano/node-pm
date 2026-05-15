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

const pushFn = vi.fn(async () => ({ gistId: 'gist123', url: 'https://gist.github.com/gist123' }));
const pullFn = vi.fn(async () => ({
  version: 1 as const,
  root: '/r2',
  concurrency: 5,
  projects: [],
}));
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
  pushFn.mockClear();
  pullFn.mockClear();
  setTokenFn.mockClear();
  getTokenFn.mockClear();
  process.exitCode = 0;
  await runCli(['node', 'pm', 'init', '--root', '/r']);
  await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
});

// ---------------------------------------------------------------------------
// sync push
// ---------------------------------------------------------------------------
describe('CLI aux commands — sync push', () => {
  it('calls GistSync.push', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'push']);
    expect(pushFn).toHaveBeenCalled();
    log.mockRestore();
  });

  it('persists gistId + lastSync into manifest after push', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'push']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.sync?.gistId).toBe('gist123');
    expect(typeof m.sync?.lastSync).toBe('string');
    log.mockRestore();
  });

  it('prints pushed gist URL to stdout', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'push']);
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('https://gist.github.com/gist123');
    log.mockRestore();
  });

  it('push error → sets non-zero exit code or throws', async () => {
    pushFn.mockRejectedValueOnce(new Error('network error'));
    let threw = false;
    try {
      await runCli(['node', 'pm', 'sync', 'push']);
    } catch {
      threw = true;
    }
    // Either throws or sets exit code non-zero
    expect(threw || (process.exitCode !== 0 && process.exitCode !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sync pull
// ---------------------------------------------------------------------------
describe('CLI aux commands — sync pull', () => {
  it('calls GistSync.pull with the provided gistId', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'pull', 'mygist']);
    expect(pullFn).toHaveBeenCalledWith('mygist');
    log.mockRestore();
  });

  it('writes the returned manifest to disk', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'pull', 'gid']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/r2');
    log.mockRestore();
  });

  it('sets sync.gistId and sync.lastSync on the saved manifest', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'sync', 'pull', 'gid99']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.sync?.gistId).toBe('gid99');
    expect(typeof m.sync?.lastSync).toBe('string');
    log.mockRestore();
  });

  it('pull error → throws or sets non-zero exit code', async () => {
    pullFn.mockRejectedValueOnce(new Error('gist not found'));
    let threw = false;
    try {
      await runCli(['node', 'pm', 'sync', 'pull', 'bad-gist']);
    } catch {
      threw = true;
    }
    expect(threw || (process.exitCode !== 0 && process.exitCode !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// config set
// ---------------------------------------------------------------------------
describe('CLI aux commands — config set', () => {
  it('token → calls setToken with the provided value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'set', 'token', 'abc123']);
    expect(setTokenFn).toHaveBeenCalledWith('abc123');
    log.mockRestore();
  });

  it('root → updates manifest.root', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'set', 'root', '/newroot']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/newroot');
    log.mockRestore();
  });

  it('concurrency → numeric value is persisted', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'set', 'concurrency', '8']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.concurrency).toBe(8);
    log.mockRestore();
  });

  it('unknown key → throws', async () => {
    await expect(
      runCli(['node', 'pm', 'config', 'set', 'badkey', 'value']),
    ).rejects.toThrow(/Unknown config key/);
  });

  it('concurrency with non-numeric value → throws (zod rejects NaN)', async () => {
    // TODO: latent bug — config.ts uses Number(value) without pre-validation.
    // Number('abc') === NaN, and ManifestSchema requires number().int().positive(),
    // so zod throws on save. The error propagates as an unhandled exception rather
    // than a friendly CLI message. Source should validate the string before Number().
    await expect(
      runCli(['node', 'pm', 'config', 'set', 'concurrency', 'abc']),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// config get
// ---------------------------------------------------------------------------
describe('CLI aux commands — config get', () => {
  it('root prints the manifest root', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'get', 'root']);
    expect(log).toHaveBeenCalledWith('/r');
    log.mockRestore();
  });

  it('concurrency prints the number as a string', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'config', 'get', 'concurrency']);
    expect(log).toHaveBeenCalledWith('5');
    log.mockRestore();
  });

  it('token prints [present] when token is set', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    getTokenFn.mockResolvedValueOnce('my-token');
    await runCli(['node', 'pm', 'config', 'get', 'token']);
    expect(log).toHaveBeenCalledWith('[present]');
    log.mockRestore();
  });

  it('token prints [missing] when no token stored', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    getTokenFn.mockResolvedValueOnce(null as unknown as string);
    await runCli(['node', 'pm', 'config', 'get', 'token']);
    expect(log).toHaveBeenCalledWith('[missing]');
    log.mockRestore();
  });

  it('unknown key → throws', async () => {
    await expect(
      runCli(['node', 'pm', 'config', 'get', 'unknown']),
    ).rejects.toThrow(/Unknown config key/);
  });
});
