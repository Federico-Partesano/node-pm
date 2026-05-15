import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

// ─── simple-git mock ──────────────────────────────────────────────────────────
const fakeGit = {
  pull: vi.fn(async () => ({ summary: { changes: 0, insertions: 0, deletions: 0 } })),
  fetch: vi.fn(async () => undefined),
  status: vi.fn(async () => ({
    current: 'main',
    isClean: () => true,
    ahead: 0,
    behind: 0,
  })),
};
vi.mock('simple-git', () => ({ simpleGit: () => fakeGit }));

// ─── execa mock (reset per-test) ──────────────────────────────────────────────
// vi.mock factory is hoisted, so we cannot reference a const declared here.
// Instead expose the mock via the module's own export and retrieve it after import.
vi.mock('execa', () => ({ execa: vi.fn() }));

// ─── fs mock (needed for status path-exists check) ───────────────────────────
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

import { GitOps } from '../../src/core/git.js';
import { GitError } from '../../src/shared/errors.js';
import { vol } from 'memfs';
import * as execaModule from 'execa';

const execaMock = execaModule.execa as ReturnType<typeof vi.fn>;

// Helper: build an execa-like promise with a stderr stream.
function makeExecaResult(lines: string[], exitCode: number, delayMs = 5): any {
  const stderr = new PassThrough();
  const p: any = new Promise<{ exitCode: number }>((res, rej) => {
    setTimeout(() => {
      if (exitCode !== 0) rej(Object.assign(new Error('git exited ' + exitCode), { exitCode }));
      else res({ exitCode });
    }, delayMs + lines.length * 2 + 2);
  });
  p.stderr = stderr;
  setTimeout(() => {
    for (const l of lines) stderr.write(l + '\n');
    stderr.end();
  }, delayMs);
  return p;
}

// Helper: execa result that throws immediately (no stderr).
function makeExecaReject(err: Error): any {
  const p: any = Promise.reject(err);
  p.stderr = new PassThrough();
  // suppress unhandledRejection in the test runner
  p.catch(() => {});
  return p;
}

beforeEach(() => {
  vol.reset();
  fakeGit.pull.mockReset();
  fakeGit.pull.mockResolvedValue({ summary: { changes: 0, insertions: 0, deletions: 0 } });
  fakeGit.fetch.mockReset();
  fakeGit.fetch.mockResolvedValue(undefined);
  fakeGit.status.mockReset();
  fakeGit.status.mockResolvedValue({
    current: 'main',
    isClean: () => true,
    ahead: 0,
    behind: 0,
  });
  execaMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// clone()
// ─────────────────────────────────────────────────────────────────────────────
describe('GitOps.clone()', () => {
  it('yields progress entries and completes (baseline)', async () => {
    execaMock.mockReturnValue(
      makeExecaResult([
        'Receiving objects:  50% (50/100)',
        'Receiving objects: 100% (100/100)',
      ], 0),
    );
    const git = new GitOps();
    const events: any[] = [];
    for await (const p of git.clone('git@x.com:a/b.git', '/dest')) events.push(p);
    expect(events.some((e) => e.percent === 50)).toBe(true);
    expect(events.at(-1)?.percent).toBe(100);
  });

  it('yields an entry per Receiving objects: N% line', async () => {
    execaMock.mockReturnValue(
      makeExecaResult([
        'Receiving objects:  25% (25/100)',
        'Receiving objects:  75% (75/100)',
        'Receiving objects: 100% (100/100)',
      ], 0),
    );
    const events: any[] = [];
    for await (const p of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(p);
    const percents = events.filter((e) => e.percent !== undefined).map((e) => e.percent);
    expect(percents).toContain(25);
    expect(percents).toContain(75);
    expect(percents).toContain(100);
  });

  it('yields entries for non-percent lines (message only, no percent field)', async () => {
    execaMock.mockReturnValue(
      makeExecaResult([
        'Cloning into /dest...',
        'remote: Counting objects: 10, done.',
      ], 0),
    );
    const events: any[] = [];
    for await (const p of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(p);
    expect(events.length).toBeGreaterThan(0);
    // Non-percent lines should have no percent field
    const nonPercent = events.filter((e) => e.percent === undefined);
    expect(nonPercent.length).toBeGreaterThan(0);
    expect(nonPercent[0]).toHaveProperty('message');
    expect(nonPercent[0]).not.toHaveProperty('percent');
  });

  it('parses Resolving deltas: N% lines', async () => {
    execaMock.mockReturnValue(
      makeExecaResult([
        'Receiving objects: 100% (100/100)',
        'Resolving deltas:  50% (50/100)',
        'Resolving deltas: 100% (100/100)',
      ], 0),
    );
    const events: any[] = [];
    for await (const p of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(p);
    const percents = events.filter((e) => e.percent !== undefined).map((e) => e.percent);
    expect(percents).toContain(50);
  });

  it('passes out-of-order percent values through unchanged', async () => {
    // Git can emit lines out of monotonic order; the generator should not filter them.
    execaMock.mockReturnValue(
      makeExecaResult([
        'Receiving objects:  80% (80/100)',
        'Receiving objects:  30% (30/100)',
        'Receiving objects: 100% (100/100)',
      ], 0),
    );
    const events: any[] = [];
    for await (const p of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(p);
    const percents = events.filter((e) => e.percent !== undefined).map((e) => e.percent);
    expect(percents).toContain(80);
    expect(percents).toContain(30);
  });

  it('throws GitError E_GIT_CLONE on non-zero exit, cause preserved', async () => {
    const cause = Object.assign(new Error('exit code 128'), { exitCode: 128 });
    execaMock.mockReturnValue(makeExecaReject(cause));

    const gen = new GitOps().clone('git@x.com:bad/bad.git', '/dest');
    const events: any[] = [];
    let thrown: unknown;
    try {
      for await (const p of gen) events.push(p);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GitError);
    expect((thrown as GitError).code).toBe('E_GIT_CLONE');
    expect((thrown as GitError).cause).toBe(cause);
  });

  it('completes without yielding when stderr stream is empty', async () => {
    const stderr = new PassThrough();
    const p: any = new Promise<{ exitCode: number }>((res) => setTimeout(() => res({ exitCode: 0 }), 20));
    p.stderr = stderr;
    // Close the stream immediately → no lines
    setTimeout(() => stderr.end(), 2);
    execaMock.mockReturnValue(p);

    const events: any[] = [];
    for await (const e of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(e);
    expect(events).toHaveLength(0);
  });

  it('throws GitError E_GIT_CLONE when proc.stderr is null', async () => {
    const p: any = Promise.resolve({ exitCode: 0 });
    p.stderr = null;
    execaMock.mockReturnValue(p);

    await expect(
      (async () => { for await (const _ of new GitOps().clone('git@x.com:a/b.git', '/dest')) {} })()
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof GitError && (e as GitError).code === 'E_GIT_CLONE',
    );
  });

  it('can be cancelled by breaking out of for-await without hanging', async () => {
    execaMock.mockReturnValue(
      makeExecaResult(
        Array.from({ length: 20 }, (_, i) => `Receiving objects: ${(i + 1) * 5}% (${i+1}/20)`),
        0,
        10,
      ),
    );
    const git = new GitOps();
    let count = 0;
    // Break after first event — should not throw or hang.
    for await (const _ of git.clone('git@x.com:a/b.git', '/dest')) {
      count++;
      break;
    }
    expect(count).toBe(1);
  });

  it('all yielded entries have phase "cloning"', async () => {
    execaMock.mockReturnValue(
      makeExecaResult([
        'remote: Enumerating objects: 10, done.',
        'Receiving objects: 100% (10/10)',
      ], 0),
    );
    const events: any[] = [];
    for await (const p of new GitOps().clone('git@x.com:a/b.git', '/dest')) events.push(p);
    expect(events.every((e) => e.phase === 'cloning')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pull()
// ─────────────────────────────────────────────────────────────────────────────
describe('GitOps.pull()', () => {
  it('returns summary with changes/insertions/deletions', async () => {
    fakeGit.pull.mockResolvedValue({ summary: { changes: 3, insertions: 10, deletions: 2 } });
    const r = await new GitOps().pull('/p');
    expect(r).toEqual({ changes: 3, insertions: 10, deletions: 2 });
  });

  it('returns summary with all-zero values (no changes)', async () => {
    fakeGit.pull.mockResolvedValue({ summary: { changes: 0, insertions: 0, deletions: 0 } });
    const r = await new GitOps().pull('/p');
    expect(r.changes).toBe(0);
    expect(r.insertions).toBe(0);
    expect(r.deletions).toBe(0);
  });

  it('throws GitError E_GIT_PULL on simple-git error, cause preserved', async () => {
    const cause = new Error('pull conflict');
    fakeGit.pull.mockRejectedValue(cause);
    await expect(new GitOps().pull('/p')).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof GitError &&
        (e as GitError).code === 'E_GIT_PULL' &&
        (e as GitError).cause === cause,
    );
  });

  it('only returns the three summary fields', async () => {
    fakeGit.pull.mockResolvedValue({ summary: { changes: 1, insertions: 2, deletions: 3 } });
    const r = await new GitOps().pull('/p');
    expect(Object.keys(r).sort()).toEqual(['changes', 'deletions', 'insertions']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// status()
// ─────────────────────────────────────────────────────────────────────────────
describe('GitOps.status()', () => {
  it('returns exists:false for non-existent path', async () => {
    // /nonexistent not in memfs → stat throws → exists:false
    const s = await new GitOps().status('/nonexistent');
    expect(s).toEqual({ branch: null, dirty: false, ahead: 0, behind: 0, exists: false });
  });

  it('repo clean → dirty:false, branch from current', async () => {
    vol.fromJSON({ '/p/x': '' });
    fakeGit.status.mockResolvedValue({
      current: 'main',
      isClean: () => true,
      ahead: 0,
      behind: 0,
    });
    const s = await new GitOps().status('/p');
    expect(s.dirty).toBe(false);
    expect(s.branch).toBe('main');
    expect(s.exists).toBe(true);
  });

  it('repo dirty → dirty:true', async () => {
    vol.fromJSON({ '/p/x': '' });
    fakeGit.status.mockResolvedValue({
      current: 'main',
      isClean: (() => false) as unknown as () => true,
      ahead: 0,
      behind: 0,
    });
    const s = await new GitOps().status('/p');
    expect(s.dirty).toBe(true);
  });

  it('ahead/behind values propagated', async () => {
    vol.fromJSON({ '/p/x': '' });
    fakeGit.status.mockResolvedValue({
      current: 'feat',
      isClean: () => true,
      ahead: 3,
      behind: 1,
    });
    const s = await new GitOps().status('/p');
    expect(s.ahead).toBe(3);
    expect(s.behind).toBe(1);
  });

  it('detached HEAD (current = null) → branch:null', async () => {
    vol.fromJSON({ '/p/x': '' });
    fakeGit.status.mockResolvedValue({
      current: null as unknown as string,
      isClean: () => true,
      ahead: 0,
      behind: 0,
    });
    const s = await new GitOps().status('/p');
    expect(s.branch).toBeNull();
  });

  it('throws GitError E_GIT_STATUS when simple-git throws', async () => {
    vol.fromJSON({ '/p/x': '' });
    const cause = new Error('not a git repo');
    fakeGit.status.mockRejectedValue(cause);
    await expect(new GitOps().status('/p')).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof GitError &&
        (e as GitError).code === 'E_GIT_STATUS' &&
        (e as GitError).cause === cause,
    );
  });

  it('returns exists:true when path exists in fs', async () => {
    vol.fromJSON({ '/repo/README.md': '# hi' });
    const s = await new GitOps().status('/repo');
    expect(s.exists).toBe(true);
  });

  it('all fields are present in the return object', async () => {
    vol.fromJSON({ '/p/x': '' });
    const s = await new GitOps().status('/p');
    expect(s).toHaveProperty('branch');
    expect(s).toHaveProperty('dirty');
    expect(s).toHaveProperty('ahead');
    expect(s).toHaveProperty('behind');
    expect(s).toHaveProperty('exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetch()
// ─────────────────────────────────────────────────────────────────────────────
describe('GitOps.fetch()', () => {
  it('calls simple-git fetch and resolves', async () => {
    await expect(new GitOps().fetch('/p')).resolves.toBeUndefined();
    expect(fakeGit.fetch).toHaveBeenCalled();
  });

  it('throws GitError E_GIT_FETCH on failure, cause preserved', async () => {
    const cause = new Error('network error');
    fakeGit.fetch.mockRejectedValue(cause);
    await expect(new GitOps().fetch('/p')).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof GitError &&
        (e as GitError).code === 'E_GIT_FETCH' &&
        (e as GitError).cause === cause,
    );
  });

  it('passes repoPath to simpleGit (fetch called per instance)', async () => {
    fakeGit.fetch.mockResolvedValue(undefined);
    await new GitOps().fetch('/my/repo');
    expect(fakeGit.fetch).toHaveBeenCalledTimes(1);
  });

  it('can fetch multiple repos sequentially', async () => {
    fakeGit.fetch.mockResolvedValue(undefined);
    await new GitOps().fetch('/repo1');
    await new GitOps().fetch('/repo2');
    expect(fakeGit.fetch).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// error shape (NodePMError base class)
// ─────────────────────────────────────────────────────────────────────────────
describe('GitError shape', () => {
  it('has correct name, code and message', async () => {
    fakeGit.pull.mockRejectedValue(new Error('boom'));
    let thrown: unknown;
    try { await new GitOps().pull('/p'); } catch (e) { thrown = e; }
    expect((thrown as GitError).name).toBe('GitError');
    expect((thrown as GitError).code).toBe('E_GIT_PULL');
    expect((thrown as GitError).message).toContain('Pull failed');
  });

  it('clone error name is GitError', async () => {
    const cause = new Error('fail');
    execaMock.mockReturnValue(makeExecaReject(cause));
    let thrown: unknown;
    try {
      for await (const _ of new GitOps().clone('git@x.com:a.git', '/dest')) {}
    } catch (e) {
      thrown = e;
    }
    expect((thrown as GitError).name).toBe('GitError');
  });

  it('status error message contains path', async () => {
    vol.fromJSON({ '/the/path/x': '' });
    fakeGit.status.mockRejectedValue(new Error('not git'));
    let thrown: unknown;
    try { await new GitOps().status('/the/path'); } catch (e) { thrown = e; }
    expect((thrown as GitError).message).toContain('/the/path');
  });
});
