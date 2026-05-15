import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Logs } from '../../src/tui/panels/Logs.js';

describe('Logs panel', () => {
  it('shows the active tab and its lines', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[
          { id: '1', label: 'a:dev', lines: ['hello', 'world'] },
          { id: '2', label: 'b:test', lines: ['boom'] },
        ]}
        activeId="1"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('a:dev');
    expect(out).toContain('hello');
    expect(out).toContain('world');
  });

  it('renders empty state', () => {
    const { lastFrame } = render(<Logs tabs={[]} activeId={null} />);
    expect(lastFrame()).toMatch(/no logs/i);
  });
});
