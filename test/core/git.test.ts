import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';

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

vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const stderr = new PassThrough();
    setTimeout(() => {
      stderr.write('Receiving objects:  50% (50/100)\n');
      stderr.write('Receiving objects: 100% (100/100)\n');
      stderr.end();
    }, 5);
    const promise: any = new Promise((res) => setTimeout(() => res({ exitCode: 0 }), 20));
    promise.stderr = stderr;
    return promise;
  }),
}));

vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

import { GitOps } from '../../src/core/git.js';
import { vol } from 'memfs';

describe('GitOps', () => {
  it('clone yields progress entries and completes', async () => {
    const git = new GitOps();
    const events: any[] = [];
    for await (const p of git.clone('git@x.com:a/b.git', '/dest')) events.push(p);
    expect(events.some((e) => e.percent === 50)).toBe(true);
    expect(events.at(-1)?.percent).toBe(100);
  });

  it('pull returns summary', async () => {
    const r = await new GitOps().pull('/p');
    expect(r.changes).toBe(0);
  });

  it('status reports branch and flags', async () => {
    vol.fromJSON({ '/p/x': '' }); // make /p exist for fs.stat
    const s = await new GitOps().status('/p');
    expect(s.branch).toBe('main');
    expect(s.dirty).toBe(false);
    expect(s.ahead).toBe(0);
    expect(s.behind).toBe(0);
    expect(s.exists).toBe(true);
  });
});
