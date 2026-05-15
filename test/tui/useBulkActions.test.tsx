import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { useBulkActions } from '../../src/tui/hooks/useBulkActions.js';
import type { GitOps } from '../../src/core/git.js';
import type { PackageManager } from '../../src/core/pm.js';
import type { TaskQueue } from '../../src/core/queue.js';
import type { Project } from '../../src/shared/types.js';

function makeQueue(): TaskQueue {
  return {
    add: vi.fn(async () => undefined),
  } as unknown as TaskQueue;
}

function makeGit(): GitOps {
  return {
    pull: vi.fn(async () => ({ changes: 0, insertions: 0, deletions: 0 })),
    clone: vi.fn(async function* () {}),
    fetch: vi.fn(async () => {}),
    status: vi.fn(async () => ({
      branch: 'main', dirty: false, ahead: 0, behind: 0, exists: true,
    })),
  } as unknown as GitOps;
}

function makePm(): PackageManager {
  return {
    detect: vi.fn(async () => 'npm' as const),
    install: vi.fn(async function* () {}),
  } as unknown as PackageManager;
}

const proj = (name: string, group = 'g'): Project => ({ name, group, url: `https://git/${name}` });

type BulkActions = ReturnType<typeof useBulkActions>;

function Harness({
  args,
  capture,
}: {
  args: Parameters<typeof useBulkActions>[0];
  capture: (v: BulkActions) => void;
}) {
  const v = useBulkActions(args);
  capture(v);
  return null;
}

function mountBulk(args: Parameters<typeof useBulkActions>[0]) {
  let latest!: BulkActions;
  render(<Harness args={args} capture={(v) => { latest = v; }} />);
  return { get current() { return latest; } };
}

const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe('useBulkActions', () => {
  it('pullSelected enqueues one queue.add per selected project', () => {
    const queue = makeQueue();
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('a'), proj('b')];
    const pathByName = new Map([['a', '/projects/a'], ['b', '/projects/b']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.pullSelected();
    expect(queue.add).toHaveBeenCalledTimes(2);
    const calls = (queue.add as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe('pull:a');
    expect(calls[1]![0]).toBe('pull:b');
  });

  it('cloneSelected calls queue.add per project', () => {
    const queue = makeQueue();
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('x')];
    const pathByName = new Map([['x', '/projects/x']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.cloneSelected();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect((queue.add as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('clone:x');
  });

  it('installSelected calls queue.add per project', () => {
    const queue = makeQueue();
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('a'), proj('b')];
    const pathByName = new Map([['a', '/p/a'], ['b', '/p/b']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.installSelected();
    expect(queue.add).toHaveBeenCalledTimes(2);
    const names = (queue.add as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(names).toContain('install:a');
    expect(names).toContain('install:b');
  });

  it('empty selectedProjects → no queue calls', () => {
    const queue = makeQueue();
    const git = makeGit();
    const pm = makePm();
    const h = mountBulk({ queue, git, pm, selectedProjects: [], pathByName: new Map() });
    h.current.pullSelected();
    h.current.cloneSelected();
    h.current.installSelected();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('pathByName missing entry → that project skipped', () => {
    const queue = makeQueue();
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('has-path'), proj('no-path')];
    const pathByName = new Map([['has-path', '/p/has-path']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.pullSelected();
    // Only 'has-path' has a path entry; 'no-path' should be skipped
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect((queue.add as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('pull:has-path');
  });

  it('pullSelected passes correct path to git.pull via queue.add task', async () => {
    const queue = {
      add: vi.fn(async (_name: string, fn: () => Promise<unknown>) => { await fn(); return undefined; }),
    } as unknown as TaskQueue;
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('myproj')];
    const pathByName = new Map([['myproj', '/work/myproj']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.pullSelected();
    await wait();
    expect(git.pull).toHaveBeenCalledWith('/work/myproj');
  });

  it('cloneSelected passes url and path to git.clone', async () => {
    const queue = {
      add: vi.fn(async (_name: string, fn: () => Promise<unknown>) => { await fn(); return undefined; }),
    } as unknown as TaskQueue;
    const git = makeGit();
    const pm = makePm();
    const p = { name: 'repo', group: 'g', url: 'https://github.com/repo' };
    const pathByName = new Map([['repo', '/code/repo']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: [p], pathByName });
    h.current.cloneSelected();
    await wait();
    expect(git.clone).toHaveBeenCalledWith('https://github.com/repo', '/code/repo');
  });

  it('installSelected passes correct path to pm.install', async () => {
    const queue = {
      add: vi.fn(async (_name: string, fn: () => Promise<unknown>) => { await fn(); return undefined; }),
    } as unknown as TaskQueue;
    const git = makeGit();
    const pm = makePm();
    const projects = [proj('pkgproj')];
    const pathByName = new Map([['pkgproj', '/code/pkgproj']]);
    const h = mountBulk({ queue, git, pm, selectedProjects: projects, pathByName });
    h.current.installSelected();
    await wait();
    expect(pm.install).toHaveBeenCalledWith('/code/pkgproj');
  });
});
