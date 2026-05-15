import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Projects } from '../../src/tui/panels/Projects.js';

describe('Projects panel', () => {
  it('renders rows with selection marker, status badge and dirty indicator', () => {
    const projects = [
      { name: 'a', group: 'g', url: 'u' },
      { name: 'b', group: 'g', url: 'u' },
    ];
    const status = new Map<string, any>([
      ['a', { branch: 'main', dirty: true,  ahead: 0, behind: 0, exists: true }],
      ['b', { branch: 'main', dirty: false, ahead: 2, behind: 0, exists: true }],
    ]);
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={status}
        selected={new Set(['b'])}
        cursor="a"
        focused
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('dirty');
    expect(out).toContain('↑2');
    expect(out).toContain('[x] b');
    expect(out).toContain('[ ] a');
  });
});
