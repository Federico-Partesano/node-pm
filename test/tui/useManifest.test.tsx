import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Text } from 'ink';

const mockLoad = vi.fn(async () => ({
  version: 1 as const,
  root: '/r',
  concurrency: 5,
  projects: [{ name: 'a', group: 'g', url: 'u' }],
}));

vi.mock('../../src/core/manifest.js', () => ({
  ManifestStore: class {
    load = mockLoad;
    invalidate() {}
  },
}));

import { useManifest } from '../../src/tui/hooks/useManifest.js';

function Probe({
  onResult,
}: {
  onResult?: (v: ReturnType<typeof useManifest>) => void;
}) {
  const v = useManifest();
  onResult?.(v);
  if (v.loading) return <Text>loading</Text>;
  if (v.error) return <Text>error:{v.error.message}</Text>;
  return <Text>count:{v.projects.length}</Text>;
}

beforeEach(() => {
  mockLoad.mockReset();
  mockLoad.mockResolvedValue({
    version: 1 as const,
    root: '/r',
    concurrency: 5,
    projects: [{ name: 'a', group: 'g', url: 'u' }],
  });
});

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('useManifest', () => {
  it('loading is true initially', () => {
    const { lastFrame } = render(<Probe />);
    expect(lastFrame()).toBe('loading');
  });

  it('loads projects on mount and sets manifest', async () => {
    const { lastFrame } = render(<Probe />);
    await wait();
    expect(lastFrame()).toBe('count:1');
  });

  it('populates projects array with the manifest projects', async () => {
    const captured: ReturnType<typeof useManifest>[] = [];
    render(<Probe onResult={(v) => captured.push(v)} />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last.projects).toHaveLength(1);
    expect(last.projects[0]!.name).toBe('a');
    expect(last.manifest).not.toBeNull();
  });

  it('sets error on load failure and loading becomes false', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const { lastFrame } = render(<Probe />);
    expect(lastFrame()).toBe('loading');
    await wait();
    expect(lastFrame()).toBe('error:boom');
  });

  it('error state has loading=false', async () => {
    mockLoad.mockRejectedValue(new Error('fail'));
    const captured: ReturnType<typeof useManifest>[] = [];
    render(<Probe onResult={(v) => captured.push(v)} />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last.loading).toBe(false);
    expect(last.error).toBeInstanceOf(Error);
  });

  it('empty projects array when manifest has no projects', async () => {
    mockLoad.mockResolvedValue({
      version: 1 as const,
      root: '/r',
      concurrency: 5,
      projects: [],
    });
    const { lastFrame } = render(<Probe />);
    await wait();
    expect(lastFrame()).toBe('count:0');
  });

  it('multiple independent mounts each call load', async () => {
    render(<Probe />);
    render(<Probe />);
    await wait();
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('manifest field is null while loading', () => {
    const captured: ReturnType<typeof useManifest>[] = [];
    render(<Probe onResult={(v) => captured.push(v)} />);
    // first capture is during render before async resolves
    expect(captured[0]!.manifest).toBeNull();
    expect(captured[0]!.loading).toBe(true);
  });

  it('loading is false after successful load', async () => {
    const captured: ReturnType<typeof useManifest>[] = [];
    render(<Probe onResult={(v) => captured.push(v)} />);
    await wait();
    const last = captured[captured.length - 1]!;
    expect(last.loading).toBe(false);
  });

  it('projects loaded with multiple entries', async () => {
    mockLoad.mockResolvedValue({
      version: 1 as const,
      root: '/r',
      concurrency: 5,
      projects: [
        { name: 'a', group: 'g', url: 'u1' },
        { name: 'b', group: 'g', url: 'u2' },
        { name: 'c', group: 'h', url: 'u3' },
      ],
    });
    const { lastFrame } = render(<Probe />);
    await wait();
    expect(lastFrame()).toBe('count:3');
  });
});
