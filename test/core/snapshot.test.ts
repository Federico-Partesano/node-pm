import { describe, it, expect, vi } from 'vitest';
import { SnapshotEngine, type SnapshotEvent } from '../../src/core/snapshot.js';
import type { Project, BlobRef } from '../../src/shared/types.js';

function makeProject(name: string): Project {
  return { name, group: 'g', url: `https://x/${name}.git` };
}

function freshGitMock() {
  return {
    headSha: vi.fn(async () => 'a'.repeat(40)),
    currentBranch: vi.fn(async () => 'main'),
    diffHead: vi.fn(async () => ''),
    listUntracked: vi.fn(async () => [] as string[]),
    listIgnored: vi.fn(async () => [] as string[]),
    listStashes: vi.fn(
      async () =>
        [] as { idx: number; message: string; includesUntracked: boolean }[],
    ),
    stashPatch: vi.fn(async () => ''),
  };
}

function freshWriterMock() {
  return {
    putStream: vi.fn(
      async ({ relPath }): Promise<BlobRef> => ({
        path: relPath,
        blob: 'b'.repeat(64),
        size: 0,
      }),
    ),
    writeMetadata: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

describe('SnapshotEngine.create', () => {
  it('emits project-start, phases in order, then project-done, then done', async () => {
    const writer = freshWriterMock();
    const engine = new SnapshotEngine({
      git: freshGitMock() as never,
      openWriter: async () => writer,
      resolveProjectPath: (_root, p) => `/root/${p.group}/${p.name}`,
    });

    const events: SnapshotEvent[] = [];
    for await (const ev of engine.create({
      projects: [makeProject('a')],
      rootDir: '/root',
      snapshotPath: '/snaps/x.npmsnap',
    })) {
      events.push(ev);
    }

    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('project-start');
    expect(kinds).toContain('project-done');
    expect(kinds[kinds.length - 1]).toBe('done');
    const phases = events
      .filter((e) => e.kind === 'phase')
      .map((e) => (e as Extract<SnapshotEvent, { kind: 'phase' }>).phase);
    expect(phases).toEqual(['diff', 'untracked', 'gitignored', 'stash', 'finalizing']);
    expect(writer.writeMetadata).toHaveBeenCalledWith(
      'snapshot.json',
      expect.any(String),
    );
    expect(writer.close).toHaveBeenCalled();
  });

  it('emits one file-progress event per untracked file', async () => {
    const git = freshGitMock();
    git.listUntracked.mockResolvedValueOnce(['a.txt', 'b.txt']);
    const engine = new SnapshotEngine({
      git: git as never,
      openWriter: async () => freshWriterMock(),
      resolveProjectPath: () => '/repo',
    });
    const events: SnapshotEvent[] = [];
    for await (const ev of engine.create({
      projects: [makeProject('p')],
      rootDir: '/r',
      snapshotPath: '/s/x.npmsnap',
    }))
      events.push(ev);
    const fileEvents = events.filter((e) => e.kind === 'file-progress');
    expect(fileEvents).toHaveLength(2);
  });
});

describe('SnapshotEngine.restore', () => {
  it('clones, resets, applies diff, writes blobs for each project', async () => {
    const readerMock = {
      readMetadata: vi.fn(async () => ''),
      getStream: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const cloneCalls: string[] = [];
    const gitR = {
      ...freshGitMock(),
      clone: vi.fn(async function* (url: string, dest: string) {
        cloneCalls.push(`${url}->${dest}`);
        yield { phase: 'cloning', percent: 100, message: 'done' };
      }),
      checkoutBranch: vi.fn(async () => {}),
      resetHard: vi.fn(async () => {}),
      applyDiff: vi.fn(async () => {}),
      applyStashPatch: vi.fn(async () => {}),
      lsRemoteHas: vi.fn(async () => true),
    };

    const engine = new SnapshotEngine({
      git: gitR as never,
      openWriter: async () => freshWriterMock(),
      openReader: async () => readerMock as never,
      resolveProjectPath: (_r, p) => `/dest/${p.group}/${p.name}`,
    });

    const snapshot = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      projects: [
        {
          name: 'a',
          group: 'g',
          url: 'https://x/a.git',
          branch: 'main',
          head: 'a'.repeat(40),
          trackedDiff: '',
          untrackedFiles: [],
          gitignoredFiles: [],
          stashes: [],
        },
      ],
    };
    const events: SnapshotEvent[] = [];
    for await (const ev of engine.restore({
      snapshot,
      snapshotPath: '/tmp/x.npmsnap',
      rootDir: '/dest',
      onConflict: async () => 'overwrite',
    }))
      events.push(ev);

    expect(cloneCalls).toEqual(['https://x/a.git->/dest/g/a']);
    expect(gitR.resetHard).toHaveBeenCalledWith('/dest/g/a', 'a'.repeat(40));
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('project-start');
    expect(kinds[kinds.length - 1]).toBe('done');
    expect(readerMock.close).toHaveBeenCalled();
  });

  it('calls onConflict when dest already exists and honours skip/overwrite/abort', async () => {
    const removeDir = vi.fn(async () => {});
    const decisions: ('skip' | 'overwrite')[] = ['skip', 'overwrite'];
    const onConflict = vi.fn(async () => decisions.shift()!);
    const gitR = {
      ...freshGitMock(),
      clone: async function* () {
        yield { phase: 'cloning' };
      },
      checkoutBranch: async () => {},
      resetHard: async () => {},
      applyDiff: async () => {},
      applyStashPatch: async () => {},
      lsRemoteHas: async () => true,
    };
    const engine = new SnapshotEngine({
      git: gitR as never,
      openWriter: async () => freshWriterMock(),
      openReader: async () =>
        ({
          readMetadata: async () => '',
          getStream: async () => {},
          close: async () => {},
        }) as never,
      resolveProjectPath: (_r, p) => `/dest/${p.name}`,
      destExists: async () => true,
      removeDest: removeDir,
    });
    const snapshot = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      projects: [
        {
          name: 'a',
          group: 'g',
          url: 'u',
          branch: 'main',
          head: 'a'.repeat(40),
          trackedDiff: '',
          untrackedFiles: [],
          gitignoredFiles: [],
          stashes: [],
        },
        {
          name: 'b',
          group: 'g',
          url: 'u',
          branch: 'main',
          head: 'a'.repeat(40),
          trackedDiff: '',
          untrackedFiles: [],
          gitignoredFiles: [],
          stashes: [],
        },
      ],
    };
    const evts: SnapshotEvent[] = [];
    for await (const ev of engine.restore({
      snapshot,
      snapshotPath: '/tmp/x.npmsnap',
      rootDir: '/dest',
      onConflict,
    }))
      evts.push(ev);
    expect(onConflict).toHaveBeenCalledTimes(2);
    expect(removeDir).toHaveBeenCalledTimes(1);
  });
});
