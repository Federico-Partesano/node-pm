import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { PassThrough } from 'node:stream';

// ─── filesystem mock ───────────────────────────────────────────────────────────
vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

// ─── execa mock (reset per-test via execaMock) ────────────────────────────────
// vi.mock factory is hoisted, cannot reference a const declared here.
vi.mock('execa', () => ({ execa: vi.fn() }));

import { PackageManager } from '../../src/core/pm.js';
import { PMError } from '../../src/shared/errors.js';
import * as execaModule from 'execa';

const execaMock = execaModule.execa as ReturnType<typeof vi.fn>;

// Helper: create a well-behaved execa promise with lines on stdout.
function makeExecaOk(lines: string[], delayMs = 5): any {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const p: any = new Promise<{ exitCode: number }>((res) =>
    setTimeout(() => res({ exitCode: 0 }), delayMs + lines.length * 2 + 5),
  );
  p.stdout = stdout;
  p.stderr = stderr;
  setTimeout(() => {
    for (const l of lines) stdout.write(l + '\n');
    stdout.end();
    stderr.end();
  }, delayMs);
  return p;
}

// Helper: execa that rejects.
function makeExecaFail(err: Error): any {
  const p: any = Promise.reject(err);
  p.stdout = new PassThrough();
  p.stderr = new PassThrough();
  p.catch(() => {}); // suppress unhandledRejection
  return p;
}

beforeEach(() => {
  vol.reset();
  execaMock.mockReset();
  // Default: working install
  execaMock.mockImplementation(() => makeExecaOk(['added 1 package']));
});

// ─────────────────────────────────────────────────────────────────────────────
// detect()
// ─────────────────────────────────────────────────────────────────────────────
describe('PackageManager.detect()', () => {
  it('detects pnpm via pnpm-lock.yaml', async () => {
    vol.fromJSON({ '/p/pnpm-lock.yaml': 'lockfileVersion: "6.0"' });
    expect(await new PackageManager().detect('/p')).toBe('pnpm');
  });

  it('detects yarn via yarn.lock', async () => {
    vol.fromJSON({ '/p/yarn.lock': '# yarn lockfile v1' });
    expect(await new PackageManager().detect('/p')).toBe('yarn');
  });

  it('detects bun via bun.lock (1.2+)', async () => {
    vol.fromJSON({ '/p/bun.lock': '{}' });
    expect(await new PackageManager().detect('/p')).toBe('bun');
  });

  it('detects bun via bun.lockb (legacy binary)', async () => {
    vol.fromJSON({ '/p/bun.lockb': '\x00\x01\x02' });
    expect(await new PackageManager().detect('/p')).toBe('bun');
  });

  it('detects npm via package-lock.json', async () => {
    vol.fromJSON({ '/p/package-lock.json': '{}' });
    expect(await new PackageManager().detect('/p')).toBe('npm');
  });

  it('falls back to npm when no lockfile present', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    expect(await new PackageManager().detect('/p')).toBe('npm');
  });

  it('returns npm for a non-existent path (stat returns null)', async () => {
    // /nonexistent not in memfs → all stat calls throw → npm fallback
    expect(await new PackageManager().detect('/nonexistent')).toBe('npm');
  });

  it('path with no package.json still returns npm fallback', async () => {
    vol.fromJSON({ '/empty/.keep': '' });
    expect(await new PackageManager().detect('/empty')).toBe('npm');
  });

  // ── priority order ────────────────────────────────────────────────────────
  it('pnpm wins over yarn when both lockfiles present', async () => {
    vol.fromJSON({ '/p/pnpm-lock.yaml': '', '/p/yarn.lock': '' });
    expect(await new PackageManager().detect('/p')).toBe('pnpm');
  });

  it('yarn wins over bun.lock when both present', async () => {
    vol.fromJSON({ '/p/yarn.lock': '', '/p/bun.lock': '' });
    expect(await new PackageManager().detect('/p')).toBe('yarn');
  });

  it('bun.lock wins over bun.lockb when both present', async () => {
    vol.fromJSON({ '/p/bun.lock': '', '/p/bun.lockb': '' });
    expect(await new PackageManager().detect('/p')).toBe('bun');
  });

  it('bun.lockb wins over package-lock.json when both present', async () => {
    vol.fromJSON({ '/p/bun.lockb': '', '/p/package-lock.json': '' });
    expect(await new PackageManager().detect('/p')).toBe('bun');
  });

  it('all five lockfiles present → pnpm wins (highest priority)', async () => {
    vol.fromJSON({
      '/p/pnpm-lock.yaml': '',
      '/p/yarn.lock': '',
      '/p/bun.lock': '',
      '/p/bun.lockb': '',
      '/p/package-lock.json': '',
    });
    expect(await new PackageManager().detect('/p')).toBe('pnpm');
  });

  it('detection is case-sensitive (Pnpm-lock.yaml not detected on Linux)', async () => {
    vol.fromJSON({ '/p/Pnpm-lock.yaml': '' });
    // memfs is case-sensitive on Linux; stat('pnpm-lock.yaml') → null
    expect(await new PackageManager().detect('/p')).toBe('npm');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// install()
// ─────────────────────────────────────────────────────────────────────────────
describe('PackageManager.install()', () => {
  it('yields at least one progress entry', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const events: any[] = [];
    for await (const p of new PackageManager().install('/p')) events.push(p);
    expect(events.length).toBeGreaterThan(0);
  });

  it('yields progress entries with phase "install"', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const events: any[] = [];
    for await (const p of new PackageManager().install('/p')) events.push(p);
    expect(events.every((e) => e.phase === 'install')).toBe(true);
  });

  it('yields progress entries with message field', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const events: any[] = [];
    for await (const p of new PackageManager().install('/p')) events.push(p);
    expect(events.every((e) => typeof e.message === 'string')).toBe(true);
  });

  it('multiple consecutive lines are yielded in order', async () => {
    const lines = ['step 1', 'step 2', 'step 3'];
    execaMock.mockReturnValue(makeExecaOk(lines));
    vol.fromJSON({ '/p/package.json': '{}' });
    const events: any[] = [];
    for await (const p of new PackageManager().install('/p')) events.push(p);
    const messages = events.map((e) => e.message);
    expect(messages).toEqual(lines);
  });

  it('spawns detected package manager as first argument to execa', async () => {
    vol.fromJSON({ '/p/pnpm-lock.yaml': '' });
    execaMock.mockReturnValue(makeExecaOk(['done']));
    const events: any[] = [];
    for await (const _ of new PackageManager().install('/p')) events.push(_);
    expect(execaMock).toHaveBeenCalledWith('pnpm', expect.any(Array), expect.any(Object));
  });

  it('spawns npm when no lockfile present', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    execaMock.mockReturnValue(makeExecaOk(['done']));
    const events: any[] = [];
    for await (const _ of new PackageManager().install('/p')) events.push(_);
    expect(execaMock).toHaveBeenCalledWith('npm', expect.any(Array), expect.any(Object));
  });

  it('spawns yarn when yarn.lock detected', async () => {
    vol.fromJSON({ '/p/yarn.lock': '' });
    execaMock.mockReturnValue(makeExecaOk(['done']));
    const events: any[] = [];
    for await (const _ of new PackageManager().install('/p')) events.push(_);
    expect(execaMock).toHaveBeenCalledWith('yarn', expect.any(Array), expect.any(Object));
  });

  it('spawns bun when bun.lock detected', async () => {
    vol.fromJSON({ '/p/bun.lock': '' });
    execaMock.mockReturnValue(makeExecaOk(['done']));
    const events: any[] = [];
    for await (const _ of new PackageManager().install('/p')) events.push(_);
    expect(execaMock).toHaveBeenCalledWith('bun', expect.any(Array), expect.any(Object));
  });

  it('throws PMError E_PM_INSTALL on spawn rejection', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const cause = new Error('ENOENT: no such file or directory, npm');
    execaMock.mockReturnValue(makeExecaFail(cause));
    await expect(
      (async () => { for await (const _ of new PackageManager().install('/p')) {} })()
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof PMError && (e as PMError).code === 'E_PM_INSTALL',
    );
  });

  it('PMError cause is preserved from the underlying error', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const cause = new Error('install crash');
    execaMock.mockReturnValue(makeExecaFail(cause));
    let thrown: unknown;
    try {
      for await (const _ of new PackageManager().install('/p')) {}
    } catch (e) {
      thrown = e;
    }
    expect((thrown as PMError).cause).toBe(cause);
  });

  it('completes without yielding when proc.stdout is null', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const p: any = Promise.resolve({ exitCode: 0 });
    p.stdout = null;
    p.stderr = new PassThrough();
    execaMock.mockReturnValue(p);
    // Should complete without throwing (stdout null → skip readline branch)
    const events: any[] = [];
    for await (const e of new PackageManager().install('/p')) events.push(e);
    expect(events).toHaveLength(0);
  });

  it('passes cwd option to execa matching the projectPath', async () => {
    vol.fromJSON({ '/my/project/package.json': '{}' });
    execaMock.mockReturnValue(makeExecaOk(['ok']));
    for await (const _ of new PackageManager().install('/my/project')) {}
    expect(execaMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  it('always calls execa with ["install"] as the args array', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    execaMock.mockReturnValue(makeExecaOk(['ok']));
    for await (const _ of new PackageManager().install('/p')) {}
    expect(execaMock).toHaveBeenCalledWith(
      expect.any(String),
      ['install'],
      expect.any(Object),
    );
  });

  it('PMError name is PMError', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    execaMock.mockReturnValue(makeExecaFail(new Error('boom')));
    let thrown: unknown;
    try { for await (const _ of new PackageManager().install('/p')) {} } catch (e) { thrown = e; }
    expect((thrown as PMError).name).toBe('PMError');
  });

  it('error message contains the project path', async () => {
    vol.fromJSON({ '/specific/path/package.json': '{}' });
    execaMock.mockReturnValue(makeExecaFail(new Error('boom')));
    let thrown: unknown;
    try { for await (const _ of new PackageManager().install('/specific/path')) {} } catch (e) { thrown = e; }
    expect((thrown as PMError).message).toContain('/specific/path');
  });

  it('error message contains the detected pm name', async () => {
    vol.fromJSON({ '/p/pnpm-lock.yaml': '' });
    execaMock.mockReturnValue(makeExecaFail(new Error('boom')));
    let thrown: unknown;
    try { for await (const _ of new PackageManager().install('/p')) {} } catch (e) { thrown = e; }
    expect((thrown as PMError).message).toContain('pnpm');
  });
});
