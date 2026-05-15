import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Text } from 'ink';

const mockStatus = vi.fn(async (p: string) => ({
  branch: 'main',
  dirty: p.includes('dirty'),
  ahead: 0,
  behind: 0,
  exists: true,
}));

vi.mock('../../src/core/git.js', () => ({
  GitOps: class {
    status = mockStatus;
    async fetch() {}
  },
}));

import { useGitStatus } from '../../src/tui/hooks/useGitStatus.js';

function Probe({ paths, refreshMs }: { paths: string[]; refreshMs?: number }) {
  const map = useGitStatus(paths, refreshMs ?? 30000);
  if (paths.length === 0) return <Text>empty</Text>;
  return (
    <Text>
      {paths.map((p) => `${p}:${map.get(p)?.dirty ? 'd' : 'c'}`).join(',')}
    </Text>
  );
}

function ProbeMap({ paths }: { paths: string[] }) {
  const map = useGitStatus(paths, 30000);
  return <Text>size:{map.size}</Text>;
}

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  mockStatus.mockReset();
  mockStatus.mockImplementation(async (p: string) => ({
    branch: 'main',
    dirty: p.includes('dirty'),
    ahead: 0,
    behind: 0,
    exists: true,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGitStatus', () => {
  it('returns a Map keyed by path', async () => {
    const captured: Map<string, unknown>[] = [];
    function CaptureProbe({ paths }: { paths: string[] }) {
      const map = useGitStatus(paths, 30000);
      captured.push(map as Map<string, unknown>);
      return null;
    }
    render(<CaptureProbe paths={['/a', '/b']} />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last).toBeInstanceOf(Map);
    expect(last.has('/a')).toBe(true);
    expect(last.has('/b')).toBe(true);
  });

  it('each path status reflects mocked GitOps', async () => {
    const { lastFrame } = render(<Probe paths={['/a', '/dirty/b']} />);
    await wait();
    expect(lastFrame()).toBe('/a:c,/dirty/b:d');
  });

  it('empty paths array returns empty map', async () => {
    const { lastFrame } = render(<ProbeMap paths={[]} />);
    await wait();
    expect(lastFrame()).toBe('size:0');
  });

  it('reports dirty / clean per path correctly', async () => {
    const { lastFrame } = render(<Probe paths={['/clean', '/dirty/repo']} />);
    await wait();
    expect(lastFrame()).toContain('/clean:c');
    expect(lastFrame()).toContain('/dirty/repo:d');
  });

  it('cleanup stops interval: no calls after unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<Probe paths={['/b']} refreshMs={1000} />);
    // Let the initial async call fire
    await vi.advanceTimersByTimeAsync(50);
    mockStatus.mockClear();
    unmount();
    // Advance past the refresh interval — no new calls expected
    vi.advanceTimersByTime(2000);
    expect(mockStatus.mock.calls.length).toBe(0);
  });

  it('path failing status is omitted from map (no crash)', async () => {
    mockStatus.mockImplementation(async (p: string) => {
      if (p === '/bad') throw new Error('fail');
      return { branch: 'main', dirty: false, ahead: 0, behind: 0, exists: true };
    });
    const captured: Map<string, unknown>[] = [];
    function CaptureProbe() {
      const map = useGitStatus(['/good', '/bad'], 30000);
      captured.push(map);
      return null;
    }
    render(<CaptureProbe />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last.has('/good')).toBe(true);
    expect(last.has('/bad')).toBe(false);
  });

  it('map is rebuilt fresh per refresh (no stale entries from removed paths)', async () => {
    const paths1 = ['/keep', '/remove'];
    const paths2 = ['/keep'];
    const captured: Map<string, unknown>[] = [];
    function DynProbe({ paths }: { paths: string[] }) {
      const map = useGitStatus(paths, 30000);
      captured.push(map);
      return null;
    }
    const { rerender } = render(<DynProbe paths={paths1} />);
    await wait();
    rerender(<DynProbe paths={paths2} />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last.has('/keep')).toBe(true);
    // stale path from previous render should NOT appear
    expect(last.has('/remove')).toBe(false);
  });

  it('updates after refresh interval', async () => {
    vi.useFakeTimers();
    render(<Probe paths={['/a']} refreshMs={500} />);
    // Let the initial call settle
    await vi.advanceTimersByTimeAsync(50);
    const initialCalls = mockStatus.mock.calls.length;
    // Advance past one refresh interval
    await vi.advanceTimersByTimeAsync(500);
    expect(mockStatus.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('single path returns map with one entry', async () => {
    const { lastFrame } = render(<ProbeMap paths={['/single']} />);
    await wait();
    expect(lastFrame()).toBe('size:1');
  });

  it('multiple paths fill map correctly', async () => {
    const { lastFrame } = render(<ProbeMap paths={['/a', '/b', '/c']} />);
    await wait();
    expect(lastFrame()).toBe('size:3');
  });
});
