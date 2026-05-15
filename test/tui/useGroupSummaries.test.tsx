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
  it('returns an empty array for empty projects', () => {
    expect(summarize([])).toEqual([]);
  });

  it('single project returns one summary with count 1', () => {
    const result = summarize([{ name: 'x', group: 'grp', url: 'u' }]);
    expect(result).toEqual([{ name: 'grp', count: 1 }]);
  });

  it('multiple projects in same group produce one summary with correct count', () => {
    const result = summarize([
      { name: 'a', group: 'team', url: 'u' },
      { name: 'b', group: 'team', url: 'u' },
      { name: 'c', group: 'team', url: 'u' },
    ]);
    expect(result).toEqual([{ name: 'team', count: 3 }]);
  });

  it('multiple groups are sorted alphabetically', () => {
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

  it('counts independent of project order in input', () => {
    const r1 = summarize([
      { name: 'a', group: 'g1', url: 'u' },
      { name: 'b', group: 'g2', url: 'u' },
      { name: 'c', group: 'g1', url: 'u' },
    ]);
    const r2 = summarize([
      { name: 'c', group: 'g1', url: 'u' },
      { name: 'b', group: 'g2', url: 'u' },
      { name: 'a', group: 'g1', url: 'u' },
    ]);
    expect(r1).toEqual(r2);
  });

  it('group with non-ASCII name sorted via localeCompare', () => {
    const result = summarize([
      { name: 'a', group: 'ñoño', url: 'u' },
      { name: 'b', group: 'alpha', url: 'u' },
    ]);
    // 'alpha' should sort before 'ñoño' in locale sort
    expect(result[0]!.name).toBe('alpha');
    expect(result[1]!.name).toBe('ñoño');
  });

  it('each group appears exactly once in output', () => {
    const result = summarize([
      { name: 'a', group: 'x', url: 'u' },
      { name: 'b', group: 'x', url: 'u' },
      { name: 'c', group: 'y', url: 'u' },
    ]);
    const names = result.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('counts are correct with mixed group sizes', () => {
    const result = summarize([
      { name: '1', group: 'a', url: 'u' },
      { name: '2', group: 'b', url: 'u' },
      { name: '3', group: 'b', url: 'u' },
      { name: '4', group: 'c', url: 'u' },
      { name: '5', group: 'c', url: 'u' },
      { name: '6', group: 'c', url: 'u' },
    ]);
    const countMap = Object.fromEntries(result.map((r) => [r.name, r.count]));
    expect(countMap['a']).toBe(1);
    expect(countMap['b']).toBe(2);
    expect(countMap['c']).toBe(3);
  });

  it('single group with many projects returns correct count', () => {
    const projects = Array.from({ length: 10 }, (_, i) => ({
      name: `proj${i}`,
      group: 'big-group',
      url: 'u',
    }));
    const result = summarize(projects);
    expect(result).toEqual([{ name: 'big-group', count: 10 }]);
  });
});
