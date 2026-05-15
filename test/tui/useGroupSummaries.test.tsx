import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { useGroupSummaries } from '../../src/tui/hooks/useGroupSummaries.js';
import type { Project } from '../../src/shared/types.js';
import type { GroupSummary } from '../../src/tui/panels/Groups.js';

function Harness({
  projects,
  capture,
}: {
  projects: Project[];
  capture: (s: GroupSummary[]) => void;
}) {
  const summaries = useGroupSummaries(projects);
  capture(summaries);
  return null;
}

function summarize(projects: Project[]): GroupSummary[] {
  let last: GroupSummary[] = [];
  render(<Harness projects={projects} capture={(s) => { last = s; }} />);
  return last;
}

describe('useGroupSummaries', () => {
  it('counts projects per group and sorts alphabetically', () => {
    const result = summarize([
      { name: 'a', group: 'zeta', url: 'u' },
      { name: 'b', group: 'alpha', url: 'u' },
      { name: 'c', group: 'alpha', url: 'u' },
      { name: 'd', group: 'mu', url: 'u' },
    ]);
    expect(result).toEqual([
      { name: 'alpha', count: 2 },
      { name: 'mu', count: 1 },
      { name: 'zeta', count: 1 },
    ]);
  });

  it('returns an empty array for an empty project list', () => {
    expect(summarize([])).toEqual([]);
  });
});
