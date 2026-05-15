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

  it('renders all group names', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'alpha', count: 1 },
          { name: 'beta', count: 5 },
          { name: 'gamma', count: 12 },
        ]}
        selected="alpha"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).toContain('gamma');
  });

  it('renders all group counts as numbers', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'work', count: 7 },
          { name: 'personal', count: 42 },
        ]}
        selected="work"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('7');
    expect(out).toContain('42');
  });

  it('selection marker precedes the selected group name', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'first', count: 2 },
          { name: 'second', count: 3 },
        ]}
        selected="second"
        focused
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    // The '❯' marker should appear before 'second' on the same line
    const lines = out.split('\n');
    const selectedLine = lines.find((l) => l.includes('second'));
    expect(selectedLine).toBeDefined();
    expect(selectedLine!).toContain('❯');
  });

  it('non-selected groups do not have the selection marker', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'selected-one', count: 1 },
          { name: 'other-one', count: 2 },
        ]}
        selected="selected-one"
        focused
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const otherLine = lines.find((l) => l.includes('other-one'));
    expect(otherLine).toBeDefined();
    // The unselected line should NOT start with '❯'
    expect(otherLine!.trimStart()).not.toMatch(/^❯/);
  });

  it('empty groups array renders header only (Groups title)', () => {
    const { lastFrame } = render(
      <Groups
        groups={[]}
        selected=""
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Groups');
    // No group rows
    const lines = out.split('\n').filter((l) => l.trim().match(/^[>]?\s*\w/));
    // The only meaningful line should be the panel title
    const nonTitleLines = lines.filter((l) => !l.includes('Groups'));
    expect(nonTitleLines.length).toBe(0);
  });

  it('single group is selectable and renders marker', () => {
    const { lastFrame } = render(
      <Groups
        groups={[{ name: 'only-group', count: 5 }]}
        selected="only-group"
        focused
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('only-group');
    expect(out).toContain('5');
    expect(out).toContain('❯');
  });

  it('renders group with count=0', () => {
    const { lastFrame } = render(
      <Groups
        groups={[{ name: 'empty-group', count: 0 }]}
        selected="empty-group"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('empty-group');
    expect(out).toContain('0');
  });

  it('long group name is rendered (not silently dropped)', () => {
    const longName = 'very-long-group-name-that-exceeds-normal-width';
    const { lastFrame } = render(
      <Groups
        groups={[{ name: longName, count: 1 }]}
        selected={longName}
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    // At least the beginning of the name should appear
    expect(out).toContain('very-long-group-name');
  });

  it('focused=false renders without crashing (no key handler active)', () => {
    // Just verify render is stable when not focused; key dispatch is not tested
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'g1', count: 4 },
          { name: 'g2', count: 6 },
        ]}
        selected="g1"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('g1');
    expect(out).toContain('g2');
  });

  it('renders "Groups" panel title', () => {
    const { lastFrame } = render(
      <Groups
        groups={[{ name: 'mygroup', count: 2 }]}
        selected="mygroup"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Groups');
  });

  it('selected group name is present in output when focused=true', () => {
    const { lastFrame } = render(
      <Groups
        groups={[
          { name: 'work', count: 3 },
          { name: 'side', count: 1 },
        ]}
        selected="work"
        focused={true}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('work');
    expect(out).toContain('side');
  });

  it('large count rendered correctly', () => {
    const { lastFrame } = render(
      <Groups
        groups={[{ name: 'large', count: 9999 }]}
        selected="large"
        focused={false}
        onSelect={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('9999');
  });
});
