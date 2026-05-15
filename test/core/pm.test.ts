import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { PassThrough } from 'node:stream';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});
vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const stdout = new PassThrough();
    setTimeout(() => { stdout.write('done\n'); stdout.end(); }, 5);
    const p: any = new Promise((res) => setTimeout(() => res({ exitCode: 0 }), 10));
    p.stdout = stdout;
    p.stderr = new PassThrough();
    return p;
  }),
}));

import { PackageManager } from '../../src/core/pm.js';

beforeEach(() => vol.reset());

describe('PackageManager', () => {
  it('detects pnpm via lockfile', async () => {
    vol.fromJSON({ '/p/pnpm-lock.yaml': 'x' });
    expect(await new PackageManager().detect('/p')).toBe('pnpm');
  });
  it('detects yarn', async () => {
    vol.fromJSON({ '/p/yarn.lock': 'x' });
    expect(await new PackageManager().detect('/p')).toBe('yarn');
  });
  it('detects bun', async () => {
    vol.fromJSON({ '/p/bun.lockb': 'x' });
    expect(await new PackageManager().detect('/p')).toBe('bun');
  });
  it('falls back to npm', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    expect(await new PackageManager().detect('/p')).toBe('npm');
  });

  it('install yields a progress sequence', async () => {
    vol.fromJSON({ '/p/package.json': '{}' });
    const pm = new PackageManager();
    const events: any[] = [];
    for await (const p of pm.install('/p')) events.push(p);
    expect(events.length).toBeGreaterThan(0);
  });
});
