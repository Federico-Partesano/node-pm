import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Groups } from '../../src/tui/panels/Groups.js';

describe('Groups panel', () => {
  it('renders groups with counts and marks the selected one', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'PERSONALE', count: 3 },
          { name: 'ISAB', count: 8 },
        ]}
        selected="ISAB"
        focused
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('PERSONALE');
    expect(out).toContain('3');
    expect(out).toContain('ISAB');
    expect(out).toContain('8');
    // selection marker present somewhere on the ISAB line
    expect(/>\s*ISAB/.test(out) || /ISAB.*◀/.test(out) || /❯ ISAB/.test(out)).toBe(true);
  });
});
