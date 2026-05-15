import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { useScriptLogs } from '../../src/tui/hooks/useScriptLogs.js';
import type { ScriptRunner } from '../../src/core/runner.js';
import type { RunHandle, Project } from '../../src/shared/types.js';

let handleIdCounter = 0;

function makeHandle(overrides: Partial<RunHandle> = {}): RunHandle {
  const stdoutCbs = new Set<(l: string) => void>();
  const stderrCbs = new Set<(l: string) => void>();
  return {
    id: `handle-${++handleIdCounter}`,
    project: { name: 'test', group: 'g', url: 'u' },
    script: 'start',
    status: 'running',
    exitCode: null,
    onStdout(cb: (l: string) => void) { stdoutCbs.add(cb); return () => { stdoutCbs.delete(cb); }; },
    onStderr(cb: (l: string) => void) { stderrCbs.add(cb); return () => { stderrCbs.delete(cb); }; },
    wait: () => new Promise(() => {}),
    kill() {},
    _emitStdout: (line: string) => stdoutCbs.forEach((cb) => cb(line)),
    _emitStderr: (line: string) => stderrCbs.forEach((cb) => cb(line)),
    ...overrides,
  } as unknown as RunHandle & { _emitStdout: (l: string) => void; _emitStderr: (l: string) => void };
}

function makeRunner(handle: RunHandle): ScriptRunner {
  return {
    spawn: vi.fn(async () => handle),
  } as unknown as ScriptRunner;
}

type Captured = ReturnType<typeof useScriptLogs>;

function Harness({ runner, capture }: { runner: ScriptRunner; capture: (v: Captured) => void }) {
  const v = useScriptLogs(runner);
  capture(v);
  return null;
}

function mountScriptLogs(runner: ScriptRunner) {
  let latest!: Captured;
  render(<Harness runner={runner} capture={(v) => { latest = v; }} />);
  return {
    get current() { return latest; },
  };
}

const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));

const project: Project = { name: 'my-app', group: 'work', url: 'u' };

describe('useScriptLogs', () => {
  it('initially empty logs and null activeLog', () => {
    const runner = makeRunner(makeHandle());
    const h = mountScriptLogs(runner);
    expect(h.current.logs).toEqual([]);
    expect(h.current.activeLog).toBeNull();
  });

  it('runScript adds a tab and sets activeLog', async () => {
    const handle = makeHandle() as RunHandle & { _emitStdout: (l: string) => void };
    const runner = makeRunner(handle);
    const h = mountScriptLogs(runner);
    await h.current.runScript(project, 'build', '/path/to/app');
    await wait();
    expect(h.current.logs).toHaveLength(1);
    expect(h.current.activeLog).toBe((handle as unknown as { id: string }).id);
  });

  it('tab label is project.name:scriptName', async () => {
    const handle = makeHandle();
    const runner = makeRunner(handle);
    const h = mountScriptLogs(runner);
    await h.current.runScript(project, 'test', '/path');
    await wait();
    expect(h.current.logs[0]!.label).toBe('my-app:test');
  });

  it('onStdout pushes lines to the tab', async () => {
    const handle = makeHandle() as RunHandle & {
      _emitStdout: (l: string) => void;
    };
    const runner = makeRunner(handle);
    let latest!: Captured;
    render(<Harness runner={runner} capture={(v) => { latest = v; }} />);
    await latest.runScript(project, 'start', '/p');
    await wait();
    (handle as unknown as { _emitStdout: (l: string) => void })._emitStdout('hello world');
    await wait();
    expect(latest.logs[0]!.lines).toContain('hello world');
  });

  it('onStderr prefixes with [err]', async () => {
    const handle = makeHandle() as RunHandle & {
      _emitStderr: (l: string) => void;
    };
    const runner = makeRunner(handle);
    let latest!: Captured;
    render(<Harness runner={runner} capture={(v) => { latest = v; }} />);
    await latest.runScript(project, 'start', '/p');
    await wait();
    (handle as unknown as { _emitStderr: (l: string) => void })._emitStderr('oh no');
    await wait();
    expect(latest.logs[0]!.lines).toContain('[err] oh no');
  });

  it('multiple concurrent scripts have all tabs present', async () => {
    const h1 = makeHandle();
    const h2 = makeHandle();
    let call = 0;
    const runner = {
      spawn: vi.fn(async () => call++ === 0 ? h1 : h2),
    } as unknown as ScriptRunner;
    let latest!: Captured;
    render(<Harness runner={runner} capture={(v) => { latest = v; }} />);
    await latest.runScript(project, 'build', '/p');
    await wait();
    await latest.runScript(project, 'test', '/p');
    await wait();
    expect(latest.logs).toHaveLength(2);
  });

  it('each new script becomes the active tab', async () => {
    let call = 0;
    const handles = [makeHandle(), makeHandle()];
    const runner = {
      spawn: vi.fn(async () => handles[call++]!),
    } as unknown as ScriptRunner;
    let latest!: Captured;
    render(<Harness runner={runner} capture={(v) => { latest = v; }} />);
    await latest.runScript(project, 'build', '/p');
    await wait();
    const firstActive = latest.activeLog;
    await latest.runScript(project, 'test', '/p');
    await wait();
    const secondActive = latest.activeLog;
    expect(secondActive).not.toBe(firstActive);
    expect(secondActive).toBe(handles[1]!.id);
  });

  it('runScript returns the handle', async () => {
    const handle = makeHandle();
    const runner = makeRunner(handle);
    const h = mountScriptLogs(runner);
    const result = await h.current.runScript(project, 'dev', '/p');
    expect(result.id).toBe(handle.id);
  });
});
