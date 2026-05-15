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

// Tracking arrays for mock calls — reset in beforeEach
const cloneCalls: string[] = [];
const pullCalls: string[] = [];
const statusCalls: string[] = [];
const installCalls: string[] = [];

// Whether clone should simulate failure for specific dest paths
let cloneShouldFail: Set<string> = new Set();

vi.mock('../../src/core/git.js', () => ({
  GitOps: class {
    async *clone(_url: string, dest: string) {
      if (cloneShouldFail.has(dest)) {
        throw new Error(`clone failed: ${dest}`);
      }
      cloneCalls.push(dest);
      yield { phase: 'cloning', percent: 100 };
    }
    async pull(p: string) {
      pullCalls.push(p);
      return { changes: 0, insertions: 0, deletions: 0 };
    }
    async status(p: string) {
      statusCalls.push(p);
      return { branch: 'main', dirty: false, ahead: 0, behind: 0, exists: true };
    }
    async fetch() {}
  },
}));
vi.mock('../../src/core/pm.js', () => ({
  PackageManager: class {
    async detect() { return 'npm' as const; }
    async *install(p: string) {
      installCalls.push(p);
      yield { phase: 'install', message: 'ok' };
    }
  },
}));

import { runCli } from '../../src/cli/index.js';

beforeEach(async () => {
  vol.reset();
  cloneCalls.length = 0;
  pullCalls.length = 0;
  statusCalls.length = 0;
  installCalls.length = 0;
  cloneShouldFail = new Set();
  process.exitCode = 0;
  await runCli(['node', 'pm', 'init', '--root', '/r']);
  await runCli(['node', 'pm', 'add', 'git@x:a/a.git', '--group', 'g']);
  await runCli(['node', 'pm', 'add', 'git@x:b/b.git', '--group', 'g']);
});

// ---------------------------------------------------------------------------
// clone --all
// ---------------------------------------------------------------------------
describe('CLI bulk commands — clone', () => {
  it('--all clones every project', async () => {
    await runCli(['node', 'pm', 'clone', '--all']);
    expect(cloneCalls.sort()).toEqual([path.join('/r', 'g', 'a'), path.join('/r', 'g', 'b')]);
  });

  it('--group filters to only that group', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'other']);
    await runCli(['node', 'pm', 'clone', '--all', '--group', 'g']);
    expect(cloneCalls).toHaveLength(2);
    expect(cloneCalls.every((p) => p.startsWith('/r/g/'))).toBe(true);
  });

  it('named args only clones those projects', async () => {
    await runCli(['node', 'pm', 'clone', 'a']);
    expect(cloneCalls).toHaveLength(1);
    expect(cloneCalls[0]).toBe(path.join('/r', 'g', 'a'));
  });

  it('empty selection (no --all, no names) → exit 1', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(['node', 'pm', 'clone']);
    expect(process.exitCode).toBe(1);
    expect(err).toHaveBeenCalledWith('No projects matched');
    err.mockRestore();
  });

  it('counts ok/fail correctly in summary', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'clone', '--all']);
    const summary = log.mock.calls.find((c) => (c[0] as string).includes('clone done'));
    expect(summary).toBeDefined();
    expect(summary![0]).toBe('clone done: 2 ok, 0 failed');
    log.mockRestore();
  });

  it('when one clone fails, exit code is 2 and other clones still complete', async () => {
    const destA = path.join('/r', 'g', 'a');
    cloneShouldFail.add(destA);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'clone', '--all']);
    expect(process.exitCode).toBe(2);
    // b was still cloned
    expect(cloneCalls).toContain(path.join('/r', 'g', 'b'));
    const summary = log.mock.calls.find((c) => (c[0] as string).includes('clone done'));
    expect(summary![0]).toBe('clone done: 1 ok, 1 failed');
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// pull --all
// ---------------------------------------------------------------------------
describe('CLI bulk commands — pull', () => {
  it('--all pulls every project', async () => {
    await runCli(['node', 'pm', 'pull', '--all']);
    expect(pullCalls).toHaveLength(2);
  });

  it('--group filters to only that group', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'other']);
    await runCli(['node', 'pm', 'pull', '--all', '--group', 'g']);
    expect(pullCalls).toHaveLength(2);
    expect(pullCalls.every((p) => p.startsWith('/r/g/'))).toBe(true);
  });

  it('named args only pulls those projects', async () => {
    await runCli(['node', 'pm', 'pull', 'b']);
    expect(pullCalls).toHaveLength(1);
    expect(pullCalls[0]).toBe(path.join('/r', 'g', 'b'));
  });

  it('empty selection → exit 1', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(['node', 'pm', 'pull']);
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });

  it('summary reports ok count when all succeed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'pull', '--all']);
    const summary = log.mock.calls.find((c) => (c[0] as string).includes('pull done'));
    expect(summary![0]).toBe('pull done: 2 ok, 0 failed');
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// status --all
// ---------------------------------------------------------------------------
describe('CLI bulk commands — status', () => {
  it('--all calls status for every project', async () => {
    await runCli(['node', 'pm', 'status', '--all']);
    expect(statusCalls).toHaveLength(2);
  });

  it('--json output is parsable and contains name/group/status', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'status', '--all', '--json']);
    expect(log).toHaveBeenCalled();
    const json = JSON.parse(log.mock.calls.at(-1)![0] as string);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
    expect(json[0]).toHaveProperty('name');
    expect(json[0]).toHaveProperty('group');
    expect(json[0]).toHaveProperty('status');
    expect(json[0].status).toHaveProperty('branch');
    log.mockRestore();
  });

  it('--group filters the status output', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'other']);
    await runCli(['node', 'pm', 'status', '--all', '--group', 'g']);
    expect(statusCalls).toHaveLength(2);
    expect(statusCalls.every((p) => p.startsWith('/r/g/'))).toBe(true);
  });

  it('plain output shows branch name for each project', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'status', '--all']);
    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes('main'))).toBe(true);
    log.mockRestore();
  });

  it('plain output shows clean badge for non-dirty repos', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'status', '--all']);
    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines.every((l) => l.includes('clean'))).toBe(true);
    log.mockRestore();
  });

  it('empty selection → exit 1', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(['node', 'pm', 'status']);
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// install --all
// ---------------------------------------------------------------------------
describe('CLI bulk commands — install', () => {
  it('--all calls install for every project', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'install', '--all']);
    expect(installCalls).toHaveLength(2);
    log.mockRestore();
  });

  it('--group filters install to that group', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'other']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'install', '--all', '--group', 'g']);
    expect(installCalls).toHaveLength(2);
    expect(installCalls.every((p) => p.startsWith('/r/g/'))).toBe(true);
    log.mockRestore();
  });

  it('empty selection → exit 1', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(['node', 'pm', 'install']);
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });

  it('summary is printed after completion', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'install', '--all']);
    const summary = log.mock.calls.find((c) => (c[0] as string).includes('install done'));
    expect(summary).toBeDefined();
    expect(summary![0]).toBe('install done: 2 ok, 0 failed');
    log.mockRestore();
  });
});
