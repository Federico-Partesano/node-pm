import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const fakeProc = (() => {
  const e = new EventEmitter() as any;
  e.stdout = new PassThrough();
  e.stderr = new PassThrough();
  e.kill = vi.fn(() => e.emit('exit', null, 'SIGTERM'));
  // ResultPromise interface: thenable returning { exitCode }
  e.then = (onFulfilled: (v: { exitCode: number }) => unknown) => Promise.resolve({ exitCode: 0 }).then(onFulfilled);
  return e;
})();
vi.mock('execa', () => ({ execa: vi.fn(() => fakeProc) }));
vi.mock('../../src/core/pm.js', () => ({
  PackageManager: class { async detect() { return 'npm' as const; } },
}));

import { ScriptRunner } from '../../src/core/runner.js';

describe('ScriptRunner', () => {
  it('streams stdout and reports exit', async () => {
    const runner = new ScriptRunner();
    const handle = await runner.spawn(
      { name: 'a', group: 'g', url: 'u' },
      'dev',
      '/path',
    );
    const lines: string[] = [];
    handle.onStdout((l) => lines.push(l));
    fakeProc.stdout.write('hello\n');
    fakeProc.stdout.write('world\n');
    await new Promise((r) => setTimeout(r, 5));
    expect(lines).toEqual(['hello', 'world']);
    const code = await handle.wait();
    expect(code).toBe(0);
    handle.kill();
    expect(handle.status).toBe('killed');
  });
});
