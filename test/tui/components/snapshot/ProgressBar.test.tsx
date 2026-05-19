import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../../../../src/tui/components/snapshot/ProgressBar.js';

describe('ProgressBar', () => {
  it('renders 0% as an empty bar', () => {
    const { lastFrame } = render(<ProgressBar percent={0} width={10} />);
    expect(lastFrame()).toContain('░'.repeat(10));
  });
  it('renders 100% as a full bar', () => {
    const { lastFrame } = render(<ProgressBar percent={100} width={10} />);
    expect(lastFrame()).toContain('█'.repeat(10));
  });
  it('renders 50% as half full', () => {
    const { lastFrame } = render(<ProgressBar percent={50} width={10} />);
    expect(lastFrame()).toContain('█'.repeat(5) + '░'.repeat(5));
  });
});
