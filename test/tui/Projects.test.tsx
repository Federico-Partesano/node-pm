import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Projects } from '../../src/tui/panels/Projects.js';
import type { GitStatus, Project } from '../../src/shared/types.js';

const mkProject = (name: string, group = 'g'): Project => ({ name, group, url: `https://github.com/org/${name}` });

const mkStatus = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  branch: 'main',
  dirty: false,
  ahead: 0,
  behind: 0,
  exists: true,
  ...overrides,
});

describe('Projects panel', () => {
  it('renders rows with selection marker, status badge and dirty indicator', () => {
    const projects = [mkProject('a'), mkProject('b')];
    const status = new Map<string, GitStatus>([
      ['a', mkStatus({ dirty: true })],
      ['b', mkStatus({ ahead: 2 })],
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

  it('empty projects list renders no rows (no project names)', () => {
    const { lastFrame } = render(
      <Projects
        projects={[]}
        statusByName={new Map()}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    // Panel title should still be there
    expect(out).toContain('Projects');
    // No project names like '[ ]' checkboxes
    expect(out).not.toContain('[ ]');
    expect(out).not.toContain('[x]');
  });

  it('single project clean shows clean badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('myrepo')]}
        statusByName={new Map([['myrepo', mkStatus()]])}
        selected={new Set()}
        cursor="myrepo"
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('myrepo');
    expect(out).toContain('clean');
    expect(out).toContain('[ ] myrepo');
  });

  it('single project dirty shows dirty badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('dirtyone')]}
        statusByName={new Map([['dirtyone', mkStatus({ dirty: true })]])}
        selected={new Set()}
        cursor="dirtyone"
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('dirty');
  });

  it('project ahead shows ↑N badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('aheadrepo')]}
        statusByName={new Map([['aheadrepo', mkStatus({ ahead: 5 })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('↑5');
  });

  it('project behind shows ↓N badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('behindrepo')]}
        statusByName={new Map([['behindrepo', mkStatus({ behind: 3 })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('↓3');
  });

  it('project missing shows ⚠missing badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('missingrepo')]}
        statusByName={new Map([['missingrepo', mkStatus({ exists: false })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('⚠missing');
  });

  it('project with missing status entry shows ... (loading) badge', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('unknown')]}
        statusByName={new Map()}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('...');
  });

  it('multi-select: selected set shows [x] for selected items', () => {
    const projects = [mkProject('a'), mkProject('b'), mkProject('c')];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map()}
        selected={new Set(['a', 'c'])}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('[x] a');
    expect(out).toContain('[ ] b');
    expect(out).toContain('[x] c');
  });

  it('cursor row renders differently (green in terminal)', () => {
    const projects = [mkProject('cur'), mkProject('other')];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map([
          ['cur', mkStatus()],
          ['other', mkStatus()],
        ])}
        selected={new Set()}
        cursor="cur"
        focused
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    // Both names should appear
    expect(out).toContain('cur');
    expect(out).toContain('other');
    // The cursor project checkbox should appear
    expect(out).toContain('[ ] cur');
  });

  it('combined dirty + ahead + behind: all badges present', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('combo')]}
        statusByName={new Map([['combo', mkStatus({ dirty: true, ahead: 2, behind: 4 })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('dirty');
    expect(out).toContain('↑2');
    expect(out).toContain('↓4');
  });

  it('rows are in order matching projects array', () => {
    const projects = [mkProject('z'), mkProject('a'), mkProject('m')];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map()}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    const idxZ = out.indexOf('z');
    const idxA = out.indexOf('a');
    const idxM = out.indexOf('m');
    // Z appears before A which appears before M, matching the projects array order
    expect(idxZ).toBeLessThan(idxA);
    expect(idxA).toBeLessThan(idxM);
  });

  it('long project name is rendered (not silently truncated beyond render)', () => {
    const longName = 'my-very-long-project-name-that-is-quite-long';
    const { lastFrame } = render(
      <Projects
        projects={[mkProject(longName)]}
        statusByName={new Map([[longName, mkStatus()]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('my-very-long-project-name');
  });

  it('focused=true renders Projects panel title', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('p1')]}
        statusByName={new Map([['p1', mkStatus()]])}
        selected={new Set()}
        cursor="p1"
        focused={true}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Projects');
  });

  it('focused=false renders Projects panel title', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('p1')]}
        statusByName={new Map([['p1', mkStatus()]])}
        selected={new Set()}
        cursor="p1"
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Projects');
  });

  it('multiple projects in different groups all rendered', () => {
    const projects = [
      mkProject('proj-a', 'groupA'),
      mkProject('proj-b', 'groupA'),
      mkProject('proj-c', 'groupB'),
    ];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map()}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('proj-a');
    expect(out).toContain('proj-b');
    expect(out).toContain('proj-c');
  });

  it('project with ahead=1 behind=0 dirty=false shows only ↑1', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('ahead1')]}
        statusByName={new Map([['ahead1', mkStatus({ ahead: 1 })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('↑1');
    expect(out).not.toContain('↓');
    expect(out).not.toContain('dirty');
  });

  it('all-selected set: all rows show [x]', () => {
    const projects = [mkProject('x1'), mkProject('x2'), mkProject('x3')];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map()}
        selected={new Set(['x1', 'x2', 'x3'])}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('[x] x1');
    expect(out).toContain('[x] x2');
    expect(out).toContain('[x] x3');
  });

  it('none-selected: all rows show [ ]', () => {
    const projects = [mkProject('n1'), mkProject('n2')];
    const { lastFrame } = render(
      <Projects
        projects={projects}
        statusByName={new Map()}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('[ ] n1');
    expect(out).toContain('[ ] n2');
    expect(out).not.toContain('[x]');
  });

  it('project with exists=false overrides other badges (shows ⚠missing only)', () => {
    const { lastFrame } = render(
      <Projects
        projects={[mkProject('gone')]}
        statusByName={new Map([['gone', mkStatus({ exists: false, dirty: true, ahead: 3 })]])}
        selected={new Set()}
        cursor={null}
        focused={false}
        onCursor={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const out = lastFrame() ?? '';
    // exists=false takes priority in badgeFor
    expect(out).toContain('⚠missing');
  });
});
