import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

const gistApi = {
  gists: {
    create: vi.fn(async () => ({ data: { id: 'gist123', html_url: 'https://gist.example/123' } })),
    update: vi.fn(async () => ({ data: { id: 'gist123', html_url: 'https://gist.example/123' } })),
    get: vi.fn(async () => ({
      data: { files: { 'projects.json': { content: JSON.stringify({
        version: 1, root: '/r', concurrency: 5, projects: [{ name: 'a', group: 'g', url: 'u' }],
      }) } } },
    })),
  },
};
vi.mock('octokit', () => ({ Octokit: class { rest = gistApi; } }));

vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    private static stored: Record<string, string | null> = {};
    constructor(private service: string, private account: string) {}
    setPassword(v: string) { (Entry as any).stored[`${this.service}/${this.account}`] = v; }
    getPassword() { return (Entry as any).stored[`${this.service}/${this.account}`] ?? 'tok'; }
    deletePassword() { delete (Entry as any).stored[`${this.service}/${this.account}`]; return true; }
  },
}));
const Entry = ((await import('@napi-rs/keyring')) as any).Entry;

import { GistSync } from '../../src/core/sync.js';

beforeEach(() => { vol.reset(); gistApi.gists.create.mockClear(); });

describe('GistSync', () => {
  it('push creates a new gist when no id is set', async () => {
    const sync = new GistSync();
    const out = await sync.push({
      version: 1, root: '/r', concurrency: 5, projects: [],
    });
    expect(out.gistId).toBe('gist123');
    expect(gistApi.gists.create).toHaveBeenCalled();
  });

  it('pull returns parsed manifest from gist', async () => {
    const sync = new GistSync();
    const m = await sync.pull('gist123');
    expect(m.projects).toHaveLength(1);
  });

  it('push falls back to local file on error', async () => {
    gistApi.gists.create.mockRejectedValueOnce(new Error('net'));
    const sync = new GistSync();
    await expect(sync.push({
      version: 1, root: '/r', concurrency: 5, projects: [],
    }, '/cwd/backup.json')).rejects.toThrow();
    const { fs } = await import('memfs');
    const data = await fs.promises.readFile('/cwd/backup.json', 'utf8');
    expect(JSON.parse(data as string).version).toBe(1);
  });
});
