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
import type { Project } from '../../src/shared/types.js';

beforeEach(async () => {
  vol.reset();
  process.exitCode = 0;
  await runCli(['node', 'pm', 'init', '--root', '/r']);
});

// ---------------------------------------------------------------------------
// empty selection
// ---------------------------------------------------------------------------
describe('runBulk — empty selection', () => {
  it('prints "No projects matched" and sets exit 1 when no projects exist', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const task = vi.fn(async () => {});
    await runBulk({ label: 'noop', all: true }, task);
    expect(task).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('No projects matched');
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });

  it('does not run the task for empty name list', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const task = vi.fn(async () => {});
    // names: [] and all: false → empty selection
    await runBulk({ label: 'noop', all: false, names: [] }, task);
    expect(task).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// all success
// ---------------------------------------------------------------------------
describe('runBulk — all success', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
  });

  it('prints "<label> done: N ok, 0 failed" and exit 0', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runBulk({ label: 'tick', all: true }, async () => {});
    expect(log).toHaveBeenCalledWith('tick done: 2 ok, 0 failed');
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it('task receives both the project object and the resolved path', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: Array<{ project: Project; projectPath: string }> = [];
    await runBulk({ label: 'check', all: true }, async (project, projectPath) => {
      seen.push({ project, projectPath });
    });
    expect(seen).toHaveLength(2);
    const a = seen.find((s) => s.project.name === 'a');
    expect(a).toBeDefined();
    expect(a!.projectPath).toBe(path.join('/r', 'g', 'a'));
    expect(a!.project.group).toBe('g');
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// all fail
// ---------------------------------------------------------------------------
describe('runBulk — all fail', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
  });

  it('sets exit 2 and reports 0 ok, N failed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runBulk({ label: 'boom', all: true }, async () => {
      throw new Error('always fails');
    });
    expect(log).toHaveBeenCalledWith('boom done: 0 ok, 2 failed');
    expect(process.exitCode).toBe(2);
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// mixed result
// ---------------------------------------------------------------------------
describe('runBulk — mixed result', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
  });

  it('ok+fail counts add up to total N and exit is 2', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runBulk({ label: 'maybe', all: true }, async (p) => {
      if (p.name === 'b') throw new Error('boom');
    });
    expect(log).toHaveBeenCalledWith('maybe done: 1 ok, 1 failed');
    expect(process.exitCode).toBe(2);
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------
describe('runBulk — selectors', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'other']);
  });

  it('--group selector runs only that group', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: string[] = [];
    await runBulk({ label: 'grp', all: true, group: 'g' }, async (p) => {
      seen.push(p.name);
    });
    expect(seen.sort()).toEqual(['a', 'b']);
    log.mockRestore();
  });

  it('names selector runs only named projects', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: string[] = [];
    await runBulk({ label: 'named', names: ['a', 'c'] }, async (p) => {
      seen.push(p.name);
    });
    expect(seen.sort()).toEqual(['a', 'c']);
    log.mockRestore();
  });

  it('--all with no group runs all projects', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: string[] = [];
    await runBulk({ label: 'all', all: true }, async (p) => {
      seen.push(p.name);
    });
    expect(seen.sort()).toEqual(['a', 'b', 'c']);
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// task signature and async forms
// ---------------------------------------------------------------------------
describe('runBulk — task variants', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
  });

  it('works with a sync-returning-Promise task', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ran: string[] = [];
    await runBulk({ label: 'sync', all: true }, (p) => {
      ran.push(p.name);
      return Promise.resolve();
    });
    expect(ran).toEqual(['a']);
    log.mockRestore();
  });

  it('works with an async generator task (AsyncIterable<Progress>)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ran: string[] = [];
    await runBulk({ label: 'gen', all: true }, async function* (p) {
      ran.push(p.name);
      yield { phase: 'doing', percent: 50 };
      yield { phase: 'done', percent: 100 };
    });
    expect(ran).toEqual(['a']);
    const summary = log.mock.calls.find((c) => (c[0] as string).includes('gen done'));
    expect(summary![0]).toBe('gen done: 1 ok, 0 failed');
    log.mockRestore();
  });

  it('task signature is (project, path) — no AbortSignal passed by runBulk', async () => {
    // Verifies the BulkTask type: task receives exactly project + projectPath.
    // TaskQueue handles cancellation internally; runBulk does not pass a signal.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let argCount = 0;
    // TypeScript ensures the signature matches BulkTask, so this verifies runtime args
    await runBulk({ label: 'sig', all: true }, async (...args: unknown[]) => {
      argCount = args.length;
    });
    expect(argCount).toBe(2); // project + projectPath only
    log.mockRestore();
  });
});
