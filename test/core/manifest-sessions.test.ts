import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return { default: fs.promises, ...fs.promises };
});

const writeFileAtomicMock = vi.fn(async (p: string, data: string) => {
  const { fs } = await import('memfs');
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, data);
});
vi.mock('write-file-atomic', () => ({
  default: (...args: Parameters<typeof writeFileAtomicMock>) => writeFileAtomicMock(...args),
}));
vi.mock('../../src/shared/paths.js', () => ({
  getManifestPath: () => '/cfg/projects.json',
  getDefaultRoot: () => '/Documents/projects',
  expandHome: (s: string) => (s.startsWith('~/') ? '/home/user' + s.slice(1) : s),
  getConfigDir: () => '/cfg',
}));

import { ManifestStore } from '../../src/core/manifest.js';
import { SessionError } from '../../src/shared/errors.js';
import type { Session } from '../../src/shared/types.js';

beforeEach(() => {
  vol.reset();
  writeFileAtomicMock.mockClear();
});

const sample: Session = {
  id: 'dev',
  label: 'Dev stack',
  terminals: [
    { name: 'api', projectRef: 'oss/api', cmd: 'npm run dev' },
    { name: 'web', projectRef: 'oss/web', cmd: 'npm run dev' },
  ],
};

describe('ManifestStore sessions', () => {
  it('returns empty list when manifest has no sessions', async () => {
    const store = new ManifestStore();
    expect(await store.listSessions()).toEqual([]);
  });

  it('adds a session and lists it', async () => {
    const store = new ManifestStore();
    await store.addSession(sample);
    const sessions = await store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('dev');
  });

  it('getSession returns the session by id', async () => {
    const store = new ManifestStore();
    await store.addSession(sample);
    const s = await store.getSession('dev');
    expect(s?.label).toBe('Dev stack');
  });

  it('getSession returns null when not found', async () => {
    const store = new ManifestStore();
    expect(await store.getSession('missing')).toBeNull();
  });

  it('rejects adding a duplicate id', async () => {
    const store = new ManifestStore();
    await store.addSession(sample);
    await expect(store.addSession(sample)).rejects.toBeInstanceOf(SessionError);
  });

  it('rejects adding a session with duplicate terminal names', async () => {
    const store = new ManifestStore();
    const bad: Session = {
      ...sample,
      terminals: [
        { name: 'api', projectRef: 'oss/api', cmd: 'x' },
        { name: 'api', projectRef: 'oss/web', cmd: 'y' },
      ],
    };
    await expect(store.addSession(bad)).rejects.toBeInstanceOf(SessionError);
  });

  it('updateSession replaces an existing session', async () => {
    const store = new ManifestStore();
    await store.addSession(sample);
    await store.updateSession({ ...sample, label: 'Updated' });
    const s = await store.getSession('dev');
    expect(s?.label).toBe('Updated');
  });

  it('updateSession throws when session missing', async () => {
    const store = new ManifestStore();
    await expect(store.updateSession(sample)).rejects.toBeInstanceOf(SessionError);
  });

  it('removeSession deletes the session', async () => {
    const store = new ManifestStore();
    await store.addSession(sample);
    await store.removeSession('dev');
    expect(await store.listSessions()).toEqual([]);
  });

  it('removeSession is a no-op when id missing', async () => {
    const store = new ManifestStore();
    await expect(store.removeSession('nope')).resolves.toBeUndefined();
  });
});
