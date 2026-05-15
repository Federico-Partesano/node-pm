import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

// ---------------------------------------------------------------------------
// Octokit mock — mutable gistApi so individual tests can swap implementations
// ---------------------------------------------------------------------------
const gistApi = {
  gists: {
    create: vi.fn(async () => ({ data: { id: 'gist123', html_url: 'https://gist.example/123' } })),
    update: vi.fn(async () => ({ data: { id: 'gist456', html_url: 'https://gist.example/456' } })),
    get: vi.fn(async () => ({
      data: {
        files: {
          'projects.json': {
            content: JSON.stringify({
              version: 1,
              root: '/r',
              concurrency: 5,
              projects: [{ name: 'a', group: 'g', url: 'u' }],
            }),
          },
        },
      },
    })),
  },
};

vi.mock('octokit', () => ({
  Octokit: class {
    rest = gistApi;
  },
}));

// ---------------------------------------------------------------------------
// Keyring mock — in-memory store; each test key path: service/account
// ---------------------------------------------------------------------------
let keyringStore: Record<string, string | null> = {};
// Track whether Entry constructor should throw (for lazy-entry test)
let entryConstructorShouldThrow = false;

vi.mock('@napi-rs/keyring', () => ({
  Entry: class MockEntry {
    private key: string;
    constructor(service: string, account: string) {
      if (entryConstructorShouldThrow) throw new Error('Backend unavailable');
      this.key = `${service}/${account}`;
    }
    setPassword(v: string) { keyringStore[this.key] = v; }
    getPassword(): string | null { return keyringStore[this.key] ?? null; }
    deletePassword() { delete keyringStore[this.key]; return true; }
  },
}));

// ---------------------------------------------------------------------------
// Import SUT *after* mocks
// ---------------------------------------------------------------------------
import { GistSync } from '../../src/core/sync.js';
import { SyncError } from '../../src/shared/errors.js';

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  vol.reset();
  keyringStore = {};
  entryConstructorShouldThrow = false;
  gistApi.gists.create.mockReset().mockResolvedValue({
    data: { id: 'gist123', html_url: 'https://gist.example/123' },
  });
  gistApi.gists.update.mockReset().mockResolvedValue({
    data: { id: 'gist456', html_url: 'https://gist.example/456' },
  });
  gistApi.gists.get.mockReset().mockResolvedValue({
    data: {
      files: {
        'projects.json': {
          content: JSON.stringify({
            version: 1,
            root: '/r',
            concurrency: 5,
            projects: [{ name: 'a', group: 'g', url: 'u' }],
          }),
        },
      },
    },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const validManifest = {
  version: 1 as const,
  root: '/r',
  concurrency: 5,
  projects: [] as { name: string; group: string; url: string }[],
};

// Token must be non-null for authenticated tests.
function seedToken(token = 'my-token') {
  keyringStore['node-pm/github-token'] = token;
}

// ---------------------------------------------------------------------------
// getToken()
// ---------------------------------------------------------------------------

describe('GistSync.getToken()', () => {
  it('returns stored value when present', async () => {
    seedToken('abc123');
    const sync = new GistSync();
    expect(await sync.getToken()).toBe('abc123');
  });

  it('returns null when keyring throws (e.g. backend unavailable)', async () => {
    // The Entry.getPassword will be called inside a try/catch in GistSync,
    // so we make the mock throw.
    const badStore: Record<string, string | null> = {};
    const origStore = keyringStore;
    keyringStore = new Proxy(badStore, {
      get(_, prop) {
        if (prop === 'node-pm/github-token') throw new Error('Backend unavailable');
        return (badStore as any)[prop as string];
      },
    });

    // We need a fresh GistSync whose _entry is lazily created.
    const sync = new GistSync();
    const token = await sync.getToken();
    expect(token).toBeNull();

    keyringStore = origStore;
  });

  it('returns the most recent setToken value (not stale)', async () => {
    seedToken('old-token');
    const sync = new GistSync();
    await sync.setToken('new-token');
    expect(await sync.getToken()).toBe('new-token');
  });
});

// ---------------------------------------------------------------------------
// setToken()
// ---------------------------------------------------------------------------

describe('GistSync.setToken()', () => {
  it('persists value to keyring', async () => {
    const sync = new GistSync();
    await sync.setToken('my-secret');
    expect(keyringStore['node-pm/github-token']).toBe('my-secret');
  });

  it('subsequent getToken returns the stored value', async () => {
    const sync = new GistSync();
    await sync.setToken('stored-val');
    expect(await sync.getToken()).toBe('stored-val');
  });
});

// ---------------------------------------------------------------------------
// push()
// ---------------------------------------------------------------------------

describe('GistSync.push()', () => {
  it('without token → throws SyncError E_SYNC_NO_TOKEN', async () => {
    // keyringStore is empty — getPassword returns null
    const sync = new GistSync();
    await expect(sync.push(validManifest)).rejects.toMatchObject({
      code: 'E_SYNC_NO_TOKEN',
      name: 'SyncError',
    });
  });

  it('with token, no existing gistId → calls gists.create', async () => {
    seedToken();
    const sync = new GistSync();
    await sync.push(validManifest);
    expect(gistApi.gists.create).toHaveBeenCalledTimes(1);
    expect(gistApi.gists.update).not.toHaveBeenCalled();
  });

  it('with token and existing gistId → calls gists.update with that id', async () => {
    seedToken();
    const sync = new GistSync();
    const manifestWithGist = {
      ...validManifest,
      sync: { gistId: 'existing-gist', lastSync: new Date().toISOString() },
    };
    await sync.push(manifestWithGist);
    expect(gistApi.gists.update).toHaveBeenCalledTimes(1);
    expect(gistApi.gists.update).toHaveBeenCalledWith(
      expect.objectContaining({ gist_id: 'existing-gist' }),
    );
    expect(gistApi.gists.create).not.toHaveBeenCalled();
  });

  it('returned object has gistId and url', async () => {
    seedToken();
    const sync = new GistSync();
    const result = await sync.push(validManifest);
    expect(result.gistId).toBe('gist123');
    expect(result.url).toBe('https://gist.example/123');
  });

  it("manifest's sync field is excluded from the gist file content (scrub)", async () => {
    seedToken();
    const sync = new GistSync();
    // No sync.gistId → goes through gists.create path; still scrubs 'sync' from payload
    const manifestWithSync = {
      ...validManifest,
      sync: { gistId: '', lastSync: new Date().toISOString() },
    };
    // A manifest with empty gistId acts like no-id (falsy check in impl)
    // Use a plain manifest without sync instead, push via create, verify scrub
    await sync.push(validManifest); // no sync field
    // create was called; inspect what was sent
    const call = (gistApi.gists.create.mock.calls as any[])[0][0] as any;
    const content = JSON.parse(call.files['projects.json'].content);
    // validManifest has no sync field — verify it's absent in the payload
    expect(content).not.toHaveProperty('sync');

    // Now verify a manifest WITH a sync field is also scrubbed (goes through update path)
    gistApi.gists.create.mockClear();
    const manifestWithGist = {
      ...validManifest,
      sync: { gistId: 'g1', lastSync: new Date().toISOString() },
    };
    await sync.push(manifestWithGist);
    const updateCall = (gistApi.gists.update.mock.calls as any[])[0][0] as any;
    const updatedContent = JSON.parse(updateCall.files['projects.json'].content);
    expect(updatedContent).not.toHaveProperty('sync');
  });

  it('network error from octokit → throws SyncError E_SYNC_PUSH; cause preserved', async () => {
    seedToken();
    const netErr = new Error('network failure');
    gistApi.gists.create.mockRejectedValueOnce(netErr);
    const sync = new GistSync();

    let caught: SyncError | undefined;
    try {
      await sync.push(validManifest);
    } catch (err) {
      caught = err as SyncError;
    }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('E_SYNC_PUSH');
    expect(caught!.cause).toBe(netErr);
  });

  it('with fallbackPath on error → writes scrubbed JSON to that path before re-throwing', async () => {
    seedToken();
    gistApi.gists.create.mockRejectedValueOnce(new Error('net'));
    const sync = new GistSync();

    await expect(sync.push(validManifest, '/cwd/backup.json')).rejects.toThrow();

    const { fs } = await import('memfs');
    const raw = await fs.promises.readFile('/cwd/backup.json', 'utf8');
    const data = JSON.parse(raw as string);
    expect(data.version).toBe(1);
    expect(data).not.toHaveProperty('sync');
  });

  it('without fallbackPath on error → no file written', async () => {
    seedToken();
    gistApi.gists.create.mockRejectedValueOnce(new Error('net'));
    const sync = new GistSync();

    await expect(sync.push(validManifest)).rejects.toThrow();

    const { fs } = await import('memfs');
    // memfs vol was reset, so filesystem should be empty
    const files = Object.keys(vol.toJSON());
    expect(files).toHaveLength(0);
  });

  it('fallback writes parent directory if missing', async () => {
    seedToken();
    gistApi.gists.create.mockRejectedValueOnce(new Error('net'));
    const sync = new GistSync();

    // Deep nested path — parent dirs don't exist
    await expect(sync.push(validManifest, '/deep/nested/dir/backup.json')).rejects.toThrow();

    const { fs } = await import('memfs');
    const raw = await fs.promises.readFile('/deep/nested/dir/backup.json', 'utf8');
    expect(JSON.parse(raw as string).version).toBe(1);
  });

  it('bad token (octokit rejects) is treated as push error (E_SYNC_PUSH)', async () => {
    seedToken('bad-token');
    gistApi.gists.create.mockRejectedValueOnce(new Error('401 Unauthorized'));
    const sync = new GistSync();

    await expect(sync.push(validManifest)).rejects.toMatchObject({
      code: 'E_SYNC_PUSH',
    });
  });
});

// ---------------------------------------------------------------------------
// pull()
// ---------------------------------------------------------------------------

describe('GistSync.pull()', () => {
  it('without token → throws SyncError E_SYNC_NO_TOKEN', async () => {
    // No token in store
    const sync = new GistSync();
    await expect(sync.pull('some-gist')).rejects.toMatchObject({
      code: 'E_SYNC_NO_TOKEN',
    });
  });

  it('returns parsed manifest from gist', async () => {
    seedToken();
    const sync = new GistSync();
    const manifest = await sync.pull('gist123');

    expect(manifest.version).toBe(1);
    expect(manifest.root).toBe('/r');
    expect(manifest.projects).toHaveLength(1);
    expect(manifest.projects[0]!.name).toBe('a');
  });

  it('empty files map → throws SyncError E_SYNC_EMPTY', async () => {
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({ data: { files: {} } } as any);
    const sync = new GistSync();

    await expect(sync.pull('gist123')).rejects.toMatchObject({
      code: 'E_SYNC_EMPTY',
    });
  });

  it('missing projects.json file in gist → throws SyncError E_SYNC_EMPTY', async () => {
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({
      data: { files: { 'other-file.txt': { content: 'stuff' } } },
    } as any);
    const sync = new GistSync();

    await expect(sync.pull('gist123')).rejects.toMatchObject({
      code: 'E_SYNC_EMPTY',
    });
  });

  it('invalid JSON in gist file → throws SyncError E_SYNC_PULL', async () => {
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({
      data: { files: { 'projects.json': { content: 'NOT JSON {{' } } },
    });
    const sync = new GistSync();

    await expect(sync.pull('gist123')).rejects.toMatchObject({
      code: 'E_SYNC_PULL',
    });
  });

  it('manifest schema invalid → throws SyncError (pin observed code: E_SYNC_PULL)', async () => {
    // Valid JSON but fails ManifestSchema (missing required fields)
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({
      data: {
        files: {
          'projects.json': {
            content: JSON.stringify({ version: 99, root: '', projects: [] }),
          },
        },
      },
    });
    const sync = new GistSync();

    // Zod throws → caught by the catch block → re-thrown as E_SYNC_PULL
    await expect(sync.pull('gist123')).rejects.toMatchObject({
      code: 'E_SYNC_PULL',
    });
  });

  it('network error → throws SyncError E_SYNC_PULL with cause', async () => {
    seedToken();
    const netErr = new Error('connection reset');
    gistApi.gists.get.mockRejectedValueOnce(netErr);
    const sync = new GistSync();

    let caught: SyncError | undefined;
    try {
      await sync.pull('gist123');
    } catch (err) {
      caught = err as SyncError;
    }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('E_SYNC_PULL');
    expect(caught!.cause).toBe(netErr);
  });

  it('lazy Entry construction: new GistSync() does NOT throw even if Entry constructor would throw', () => {
    entryConstructorShouldThrow = true;
    // GistSync defers Entry creation to first getToken/setToken call.
    // The constructor itself must not throw.
    expect(() => new GistSync()).not.toThrow();
  });

  it('uses the provided gistId in the gists.get call', async () => {
    seedToken();
    const sync = new GistSync();
    await sync.pull('my-specific-gist');
    expect(gistApi.gists.get).toHaveBeenCalledWith({ gist_id: 'my-specific-gist' });
  });

  it('returned manifest includes all projects from gist', async () => {
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({
      data: {
        files: {
          'projects.json': {
            content: JSON.stringify({
              version: 1,
              root: '/root',
              concurrency: 3,
              projects: [
                { name: 'proj1', group: 'g1', url: 'u1' },
                { name: 'proj2', group: 'g2', url: 'u2' },
              ],
            }),
          },
        },
      },
    });
    const sync = new GistSync();
    const manifest = await sync.pull('gist-multi');

    expect(manifest.projects).toHaveLength(2);
    expect(manifest.projects[0]!.name).toBe('proj1');
    expect(manifest.projects[1]!.name).toBe('proj2');
  });

  it('file with null content → throws SyncError E_SYNC_EMPTY', async () => {
    seedToken();
    gistApi.gists.get.mockResolvedValueOnce({
      data: { files: { 'projects.json': { content: null } } },
    } as any);
    const sync = new GistSync();
    await expect(sync.pull('gist123')).rejects.toMatchObject({
      code: 'E_SYNC_EMPTY',
    });
  });
});

// ---------------------------------------------------------------------------
// push() additional edge cases
// ---------------------------------------------------------------------------

describe('GistSync.push() additional', () => {
  it('update path returns the correct gistId and url from update response', async () => {
    seedToken();
    const sync = new GistSync();
    const manifestWithGist = {
      ...validManifest,
      sync: { gistId: 'existing-123', lastSync: new Date().toISOString() },
    };
    const result = await sync.push(manifestWithGist);
    expect(result.gistId).toBe('gist456'); // from update mock
    expect(result.url).toBe('https://gist.example/456');
  });

  it('projects are preserved in the gist file content', async () => {
    seedToken();
    const sync = new GistSync();
    const manifestWithProjects = {
      ...validManifest,
      projects: [{ name: 'p1', group: 'grp', url: 'http://u' }],
    };
    await sync.push(manifestWithProjects);
    const call = (gistApi.gists.create.mock.calls as any[])[0][0] as any;
    const content = JSON.parse(call.files['projects.json'].content);
    expect(content.projects).toHaveLength(1);
    expect(content.projects[0].name).toBe('p1');
  });

  it('push network error wraps original cause in SyncError', async () => {
    seedToken();
    const original = new Error('timeout');
    gistApi.gists.create.mockRejectedValueOnce(original);
    const sync = new GistSync();

    let caught: SyncError | undefined;
    try {
      await sync.push(validManifest);
    } catch (err) {
      caught = err as SyncError;
    }

    expect(caught).toBeInstanceOf(SyncError);
    expect(caught!.cause).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// getToken() / setToken() additional
// ---------------------------------------------------------------------------

describe('GistSync.getToken() additional', () => {
  it('returns null when no token has ever been set', async () => {
    // keyringStore is empty (reset in beforeEach); getPassword returns null
    const sync = new GistSync();
    expect(await sync.getToken()).toBeNull();
  });
});

describe('GistSync.setToken() additional', () => {
  it('overwriting a token replaces the old value', async () => {
    const sync = new GistSync();
    await sync.setToken('first');
    await sync.setToken('second');
    expect(await sync.getToken()).toBe('second');
  });
});
