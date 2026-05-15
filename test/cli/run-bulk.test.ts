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
vi.mock('../../src/shared/paths.js', async () => {
  const actual: any = await vi.importActual('../../src/shared/paths.js');
  return {
    ...actual,
    getManifestPath: () => '/cfg/projects.json',
    getDefaultRoot: () => '/r',
    getConfigDir: () => '/cfg',
    expandHome: (s: string) => s,
  };
});

import { runCli } from '../../src/cli/index.js';
import { runBulk } from '../../src/cli/run-bulk.js';

beforeEach(async () => {
  vol.reset();
  process.exitCode = 0;
  await runCli(['node', 'pm', 'init', '--root', '/r']);
});

describe('runBulk', () => {
  it('sets exit code 1 and reports when no projects match', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const task = vi.fn(async () => {});
    await runBulk({ label: 'noop', all: true }, task);
    expect(task).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('No projects matched');
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });

  it('runs the task for each target and reports success summary', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: string[] = [];
    await runBulk({ label: 'tick', all: true }, async (p, projectPath) => {
      seen.push(`${p.name}@${projectPath}`);
    });
    expect(seen.sort()).toEqual([
      `a@${path.join('/r', 'g', 'a')}`,
      `b@${path.join('/r', 'g', 'b')}`,
    ]);
    expect(log).toHaveBeenCalledWith('tick done: 2 ok, 0 failed');
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it('sets exit code 2 when any task fails and reports mixed summary', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runBulk({ label: 'maybe', all: true }, async (p) => {
      if (p.name === 'b') throw new Error('boom');
    });
    expect(log).toHaveBeenCalledWith('maybe done: 1 ok, 1 failed');
    expect(process.exitCode).toBe(2);
    log.mockRestore();
  });
});
