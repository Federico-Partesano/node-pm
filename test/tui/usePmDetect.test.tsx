import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { usePmDetect } from '../../src/tui/hooks/usePmDetect.js';
import type { PackageManager } from '../../src/core/pm.js';
import type { PMName } from '../../src/shared/types.js';

function makePm(detect: (p: string) => Promise<PMName>): PackageManager {
  return { detect } as unknown as PackageManager;
}

function Probe({
  path,
  pm,
  onResult,
}: {
  path: string | null;
  pm: PackageManager;
  onResult?: (v: PMName | null) => void;
}) {
  const name = usePmDetect(path, pm);
  onResult?.(name);
  return <Text>{name ?? 'null'}</Text>;
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('usePmDetect', () => {
  it('null path returns null', () => {
    const pm = makePm(() => Promise.resolve('npm'));
    const { lastFrame } = render(<Probe path={null} pm={pm} />);
    expect(lastFrame()).toBe('null');
  });

  it('detect returns name → state set', async () => {
    const pm = makePm(async () => 'pnpm');
    const { lastFrame } = render(<Probe path={'/my/project'} pm={pm} />);
    await wait();
    expect(lastFrame()).toBe('pnpm');
  });

  it('detection error → null', async () => {
    const pm = makePm(async () => { throw new Error('fail'); });
    const { lastFrame } = render(<Probe path={'/bad/path'} pm={pm} />);
    await wait();
    expect(lastFrame()).toBe('null');
  });

  it('path change cancels stale promise: only latest result is set', async () => {
    let resolve1!: (n: PMName) => void;
    let resolve2!: (n: PMName) => void;
    const p1 = new Promise<PMName>((r) => { resolve1 = r; });
    const p2 = new Promise<PMName>((r) => { resolve2 = r; });
    let callCount = 0;
    const pm = makePm(() => {
      callCount++;
      return callCount === 1 ? p1 : p2;
    });

    const captured: (PMName | null)[] = [];
    const { rerender } = render(
      <Probe path="/path1" pm={pm} onResult={(v) => captured.push(v)} />,
    );

    // Switch path before resolve1 fires
    rerender(<Probe path="/path2" pm={pm} onResult={(v) => captured.push(v)} />);

    // Resolve stale first (for path1) — should be cancelled
    resolve1('yarn');
    // Resolve new second (for path2)
    resolve2('bun');
    await wait();

    // Final state should be 'bun' from path2, not 'yarn' from stale path1
    const finalValues = captured.filter((v) => v !== null);
    expect(finalValues[finalValues.length - 1]).toBe('bun');
  });

  it('re-renders with same path do not re-fire detection', async () => {
    const detectMock = vi.fn(async (): Promise<PMName> => 'npm');
    const pm = makePm(detectMock);
    const { rerender } = render(<Probe path="/same" pm={pm} />);
    rerender(<Probe path="/same" pm={pm} />);
    rerender(<Probe path="/same" pm={pm} />);
    await wait();
    // Should only detect once for the same path
    expect(detectMock).toHaveBeenCalledTimes(1);
  });

  it('changing path triggers new detection', async () => {
    const detectMock = vi.fn(async (): Promise<PMName> => 'npm');
    const pm = makePm(detectMock);
    const { rerender } = render(<Probe path="/path1" pm={pm} />);
    await wait();
    rerender(<Probe path="/path2" pm={pm} />);
    await wait();
    expect(detectMock).toHaveBeenCalledTimes(2);
    expect(detectMock).toHaveBeenCalledWith('/path1');
    expect(detectMock).toHaveBeenCalledWith('/path2');
  });

  it('changing path from non-null to null resets to null', async () => {
    const pm = makePm(async () => 'yarn');
    const { rerender, lastFrame } = render(<Probe path="/p" pm={pm} />);
    await wait();
    expect(lastFrame()).toBe('yarn');
    rerender(<Probe path={null} pm={pm} />);
    await wait();
    expect(lastFrame()).toBe('null');
  });
});
