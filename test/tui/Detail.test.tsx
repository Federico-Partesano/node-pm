import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Detail } from '../../src/tui/panels/Detail.js';

describe('Detail panel', () => {
  it('shows project info and favorite scripts', () => {
    const { lastFrame } = render(
      <Detail
        project={{
          name: 'a', group: 'g', url: 'git@x:a/a.git',
          scripts: { favorites: ['dev', 'test'] },
        }}
        path="/r/g/a"
        pmName="pnpm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('git@x:a/a.git');
    expect(out).toContain('/r/g/a');
    expect(out).toContain('pnpm');
    expect(out).toContain('dev');
    expect(out).toContain('test');
  });

  it('shows empty state when no project is selected', () => {
    const { lastFrame } = render(<Detail project={null} path={null} pmName={null} />);
    expect(lastFrame()).toMatch(/no project/i);
  });
});
