import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Text } from 'ink';

const list = vi.fn(async () => [{ name: 'a', group: 'g', url: 'u' }]);
vi.mock('../../src/core/manifest.js', () => ({
  ManifestStore: class { list = list; async load() { return { version: 1, root: '/r', concurrency: 5, projects: [{ name: 'a', group: 'g', url: 'u' }] }; } },
}));

import { useManifest } from '../../src/tui/hooks/useManifest.js';

function Probe() {
  const { projects, loading } = useManifest();
  if (loading) return <Text>loading</Text>;
  return <Text>count:{projects.length}</Text>;
}

beforeEach(() => list.mockClear());

describe('useManifest', () => {
  it('loads projects on mount', async () => {
    const { lastFrame } = render(<Probe />);
    expect(lastFrame()).toBe('loading');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toBe('count:1');
  });
});
