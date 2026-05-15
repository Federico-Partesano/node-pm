import React from 'react';
import { render } from 'ink-testing-library';
import { Text, Box } from 'ink';
import { describe, it, expect } from 'vitest';
import { Panel } from '../../../src/tui/components/Panel.js';

describe('Panel component', () => {
  it('renders the title text', () => {
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

  it('renders border box-drawing chars when focused=true', () => {
    const { lastFrame } = render(<Panel title="FocusedPanel" focused={true} />);
    const out = lastFrame() ?? '';
    expect(out).toMatch(/[╭╮╯╰─│]/);
    expect(out).toContain('FocusedPanel');
  });

  it('renders border box-drawing chars when focused=false', () => {
    const { lastFrame } = render(<Panel title="BlurredPanel" focused={false} />);
    const out = lastFrame() ?? '';
    expect(out).toMatch(/[╭╮╯╰─│]/);
    expect(out).toContain('BlurredPanel');
  });

  it('focused defaults to false (border still rendered)', () => {
    // No focused prop passed — should still render the border structure
    const { lastFrame } = render(<Panel title="DefaultFocus" />);
    const out = lastFrame() ?? '';
    expect(out).toMatch(/[╭╮╯╰─│]/);
    expect(out).toContain('DefaultFocus');
  });

  it('renders multiple children', () => {
    const { lastFrame } = render(
      <Panel title="Multi">
        <Text>first-child</Text>
        <Box>
          <Text>nested-child</Text>
        </Box>
      </Panel>,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('first-child');
    expect(out).toContain('nested-child');
  });

  it('renders without crashing when children is undefined (empty)', () => {
    const { lastFrame } = render(<Panel title="EmptyPanel" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('EmptyPanel');
    expect(out).toMatch(/[╭╮╯╰─│]/);
  });

  it('renders title with special characters', () => {
    const { lastFrame } = render(<Panel title="Panel/Special:Chars!" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Panel/Special:Chars!');
  });

  it('renders empty title string', () => {
    const { lastFrame } = render(<Panel title="" />);
    const out = lastFrame() ?? '';
    // Should still render the border structure
    expect(out).toMatch(/[╭╮╯╰─│]/);
  });

  it('renders title with unicode characters', () => {
    const { lastFrame } = render(<Panel title="→ Arrow ← Panel ✓" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('→ Arrow ← Panel ✓');
  });

  it('renders deeply nested children', () => {
    const { lastFrame } = render(
      <Panel title="Deep">
        <Box flexDirection="column">
          <Text>level1</Text>
          <Box>
            <Text>level2</Text>
          </Box>
        </Box>
      </Panel>,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('level1');
    expect(out).toContain('level2');
  });

  it('renders multiple Text children each on their own line', () => {
    const { lastFrame } = render(
      <Panel title="Lines">
        <Text>line-alpha</Text>
        <Text>line-beta</Text>
        <Text>line-gamma</Text>
      </Panel>,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-alpha');
    expect(out).toContain('line-beta');
    expect(out).toContain('line-gamma');
  });

  it('title appears before children in output', () => {
    const { lastFrame } = render(
      <Panel title="TitleFirst">
        <Text>body-text</Text>
      </Panel>,
    );
    const out = lastFrame() ?? '';
    const titleIdx = out.indexOf('TitleFirst');
    const bodyIdx = out.indexOf('body-text');
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThan(titleIdx);
  });

  it('renders title when children is null-like (fragment)', () => {
    const { lastFrame } = render(
      <Panel title="FragTitle">
        <></>
      </Panel>,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('FragTitle');
  });
});
