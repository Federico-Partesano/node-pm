import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';

vi.mock('../../src/core/git.js', () => ({
  GitOps: class {
    async status(p: string) {
      return { branch: 'main', dirty: p.includes('dirty'), ahead: 0, behind: 0, exists: true };
    }
    async fetch() {}
  },
}));

import { useGitStatus } from '../../src/tui/hooks/useGitStatus.js';

function Probe({ paths }: { paths: string[] }) {
  const map = useGitStatus(paths);
  return <Text>{paths.map((p) => `${p}:${map.get(p)?.dirty ? 'd' : 'c'}`).join(',')}</Text>;
}

describe('useGitStatus', () => {
  it('reports dirty / clean per path', async () => {
    const { lastFrame } = render(<Probe paths={['/a', '/dirty/b']} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(lastFrame()).toBe('/a:c,/dirty/b:d');
  });
});
