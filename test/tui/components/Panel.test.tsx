import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, it, expect } from 'vitest';
import { Panel } from '../../../src/tui/components/Panel.js';

describe('Panel component', () => {
  it('renders the title', () => {
    const { lastFrame } = render(<Panel title="Hello" />);
    expect(lastFrame() ?? '').toContain('Hello');
  });

  it('renders children', () => {
    const { lastFrame } = render(
      <Panel title="T">
        <Text>child-content</Text>
      </Panel>,
    );
    expect(lastFrame() ?? '').toContain('child-content');
  });

  it('renders a bordered box in both focused and blurred states', () => {
    // Border color is ANSI-encoded and stripped by the test renderer when stdout is not a TTY,
    // so assert the structural box-drawing characters are present in both.
    const focused = render(<Panel title="T" focused />).lastFrame() ?? '';
    const blurred = render(<Panel title="T" focused={false} />).lastFrame() ?? '';
    expect(focused).toMatch(/[╭╮╯╰─│]/);
    expect(blurred).toMatch(/[╭╮╯╰─│]/);
  });
});
