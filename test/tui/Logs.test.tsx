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

  it('renders empty state (no logs) when tabs is empty', () => {
    const { lastFrame } = render(<Logs tabs={[]} activeId={null} />);
    expect(lastFrame()).toMatch(/no logs/i);
  });

  it('no tabs renders "no logs" message', () => {
    const { lastFrame } = render(<Logs tabs={[]} activeId={null} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('no logs');
  });

  it('single tab with activeId set renders tab label and lines', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'tab1', label: 'my-project:build', lines: ['line1', 'line2', 'line3'] }]}
        activeId="tab1"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('my-project:build');
    expect(out).toContain('line1');
    expect(out).toContain('line2');
    expect(out).toContain('line3');
  });

  it('single tab with activeId null falls back to first tab', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'fallback', label: 'fallback:dev', lines: ['fallback-line'] }]}
        activeId={null}
      />,
    );
    const out = lastFrame() ?? '';
    // Should render the first tab (fallback) since activeId is null
    expect(out).toContain('fallback:dev');
    expect(out).toContain('fallback-line');
  });

  it('multiple tabs show all labels in tab bar', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[
          { id: 't1', label: 'alpha:dev', lines: [] },
          { id: 't2', label: 'beta:test', lines: [] },
          { id: 't3', label: 'gamma:build', lines: [] },
        ]}
        activeId="t1"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('alpha:dev');
    expect(out).toContain('beta:test');
    expect(out).toContain('gamma:build');
  });

  it('active tab label is different from inactive (both appear in output)', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[
          { id: 'active', label: 'proj-a:dev', lines: ['active-line'] },
          { id: 'inactive', label: 'proj-b:dev', lines: ['inactive-line'] },
        ]}
        activeId="active"
      />,
    );
    const out = lastFrame() ?? '';
    // Both tab labels are in the tab bar
    expect(out).toContain('proj-a:dev');
    expect(out).toContain('proj-b:dev');
    // Active tab body lines are rendered
    expect(out).toContain('active-line');
    // Inactive tab body lines are NOT rendered
    expect(out).not.toContain('inactive-line');
  });

  it('lines longer than 20: only last 20 rendered', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `log-line-${i}`);
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 't', label: 'my:tab', lines }]}
        activeId="t"
      />,
    );
    const out = lastFrame() ?? '';
    // First 5 lines (0-4) should NOT appear
    expect(out).not.toContain('log-line-0');
    expect(out).not.toContain('log-line-4');
    // Last 20 lines (5-24) should appear
    expect(out).toContain('log-line-5');
    expect(out).toContain('log-line-24');
  });

  it('empty lines array on active tab renders no body lines', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'empty', label: 'empty:tab', lines: [] }]}
        activeId="empty"
      />,
    );
    const out = lastFrame() ?? '';
    // Tab label is still visible
    expect(out).toContain('empty:tab');
    // No body content from lines
    // (Just verify no crash and tab bar renders)
    expect(out).toMatch(/[╭╮╯╰─│]/);
  });

  it('special characters in log lines render correctly', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'special', label: 'special:tab', lines: ['[ERROR] → failed ✗', 'line with "quotes" & <html>'] }]}
        activeId="special"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('[ERROR]');
    expect(out).toContain('failed');
    expect(out).toContain('quotes');
  });

  it('tab id with special characters handled (label still rendered)', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'tab/with:special#chars', label: 'special-id-tab', lines: ['content'] }]}
        activeId="tab/with:special#chars"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('special-id-tab');
    expect(out).toContain('content');
  });

  it('renders Logs panel title', () => {
    const { lastFrame } = render(<Logs tabs={[]} activeId={null} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Logs');
  });

  it('exactly 20 lines: all rendered', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const { lastFrame } = render(
      <Logs
        tabs={[{ id: 'exact', label: 'exact:tab', lines }]}
        activeId="exact"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-0');
    expect(out).toContain('line-19');
  });

  it('activeId matching non-existent tab falls back to first tab', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[
          { id: 'first', label: 'first-tab', lines: ['first-content'] },
          { id: 'second', label: 'second-tab', lines: ['second-content'] },
        ]}
        activeId="nonexistent-id"
      />,
    );
    const out = lastFrame() ?? '';
    // Falls back to first tab
    expect(out).toContain('first-content');
    expect(out).not.toContain('second-content');
  });

  it('second tab active shows second tab lines', () => {
    const { lastFrame } = render(
      <Logs
        tabs={[
          { id: 'tab1', label: 'label1', lines: ['first-tab-line'] },
          { id: 'tab2', label: 'label2', lines: ['second-tab-line'] },
        ]}
        activeId="tab2"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('second-tab-line');
    expect(out).not.toContain('first-tab-line');
    // But both labels in tab bar
    expect(out).toContain('label1');
    expect(out).toContain('label2');
  });
});
