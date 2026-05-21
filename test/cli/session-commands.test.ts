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
vi.mock('../../src/shared/paths.js', () => ({
  getManifestPath: () => '/cfg/projects.json',
  getDefaultRoot: () => '/r',
  getConfigDir: () => '/cfg',
  expandHome: (s: string) => s,
}));

import { runCli } from '../../src/cli/index.js';

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vol.reset();
  const { fs } = await import('memfs');
  await fs.promises.mkdir('/cfg', { recursive: true });
  await fs.promises.writeFile(
    '/cfg/projects.json',
    JSON.stringify({ version: 1, root: '/r', concurrency: 5, projects: [], sessions: [] }),
  );
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

function logText(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

describe('pm session list (empty)', () => {
  it('prints (no sessions) when manifest has none', async () => {
    await runCli(['node', 'pm', 'session', 'list']);
    expect(logText()).toContain('(no sessions)');
  });
});

describe('pm session create / list / show / remove', () => {
  it('roundtrips a session through CLI', async () => {
    await runCli([
      'node',
      'pm',
      'session',
      'create',
      'dev',
      '--label',
      'Dev stack',
      '--terminal',
      'api=oss/api:npm run dev',
      '--terminal',
      'web=oss/web:npm run dev',
    ]);
    expect(logText()).toMatch(/Created session dev/);

    logSpy.mockClear();
    await runCli(['node', 'pm', 'session', 'list']);
    expect(logText()).toMatch(/dev\s+Dev stack\s+\(2 terminals\)/);

    logSpy.mockClear();
    await runCli(['node', 'pm', 'session', 'show', 'dev']);
    const shown = logText();
    expect(shown).toContain('dev  —  Dev stack');
    expect(shown).toContain('api  [oss/api]  npm run dev');
    expect(shown).toContain('web  [oss/web]  npm run dev');

    logSpy.mockClear();
    await runCli(['node', 'pm', 'session', 'remove', 'dev']);
    expect(logText()).toContain('Removed session dev');

    logSpy.mockClear();
    await runCli(['node', 'pm', 'session', 'list']);
    expect(logText()).toContain('(no sessions)');
  });
});

describe('pm session create validation', () => {
  it('rejects bad --terminal format', async () => {
    await expect(
      runCli([
        'node',
        'pm',
        'session',
        'create',
        'bad',
        '--label',
        'Bad',
        '--terminal',
        'no-equals',
      ]),
    ).rejects.toThrow(/name=projectRef:cmd/);
  });

  it('requires at least one terminal', async () => {
    await expect(
      runCli(['node', 'pm', 'session', 'create', 'empty', '--label', 'Empty']),
    ).rejects.toThrow(/At least one --terminal/);
  });
});

describe('pm session show missing', () => {
  it('reports not found', async () => {
    await runCli(['node', 'pm', 'session', 'show', 'nope']);
    expect(logText()).toContain('Session "nope" not found.');
  });
});
