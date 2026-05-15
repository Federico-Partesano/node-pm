import React from 'react';
import os from 'node:os';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import type { Manifest, Project } from '../../src/shared/types.js';
import { useVisibleProjects } from '../../src/tui/hooks/useVisibleProjects.js';
import type { VisibleProjects } from '../../src/tui/hooks/useVisibleProjects.js';

// We don't mock paths; resolveProjectPath uses path.join(expandHome(root), group, name)
// We'll use /abs paths so no tilde expansion is needed for basic tests.

const makeManifest = (root = '/projects'): Manifest => ({
  version: 1,
  root,
  concurrency: 5,
  projects: [],
});

function Harness({
  projects,
  activeGroup,
  manifest,
  capture,
}: {
  projects: Project[];
  activeGroup: string | null;
  manifest: Manifest | null;
  capture: (v: VisibleProjects) => void;
}) {
  const v = useVisibleProjects(projects, activeGroup, manifest);
  capture(v);
  return null;
}

function compute(
  projects: Project[],
  activeGroup: string | null,
  manifest: Manifest | null,
): VisibleProjects {
  let last!: VisibleProjects;
  render(
    <Harness
      projects={projects}
      activeGroup={activeGroup}
      manifest={manifest}
      capture={(v) => { last = v; }}
    />,
  );
  return last;
}

describe('useVisibleProjects', () => {
  it('empty projects returns empty visible, paths, pathByName', () => {
    const result = compute([], 'grp', makeManifest());
    expect(result.visible).toEqual([]);
    expect(result.paths).toEqual([]);
    expect(result.pathByName.size).toBe(0);
  });

  it('null manifest returns empty paths and pathByName but filters visible', () => {
    const projects: Project[] = [{ name: 'a', group: 'g', url: 'u' }];
    const result = compute(projects, 'g', null);
    expect(result.visible).toHaveLength(1);
    expect(result.paths).toEqual([]);
    expect(result.pathByName.size).toBe(0);
  });

  it('filters to active group only', () => {
    const projects: Project[] = [
      { name: 'a', group: 'g1', url: 'u' },
      { name: 'b', group: 'g2', url: 'u' },
      { name: 'c', group: 'g1', url: 'u' },
    ];
    const result = compute(projects, 'g1', makeManifest());
    expect(result.visible.map((p) => p.name)).toEqual(['a', 'c']);
  });

  it('activeGroup=null returns empty visible list', () => {
    const projects: Project[] = [{ name: 'a', group: 'g', url: 'u' }];
    const result = compute(projects, null, makeManifest());
    expect(result.visible).toEqual([]);
  });

  it('pathByName has correct path per project', () => {
    const projects: Project[] = [{ name: 'my-app', group: 'work', url: 'u' }];
    const manifest = makeManifest('/projects');
    const result = compute(projects, 'work', manifest);
    expect(result.pathByName.get('my-app')).toBe('/projects/work/my-app');
  });

  it('paths array order matches visible order', () => {
    const projects: Project[] = [
      { name: 'first', group: 'g', url: 'u' },
      { name: 'second', group: 'g', url: 'u' },
      { name: 'third', group: 'g', url: 'u' },
    ];
    const manifest = makeManifest('/root');
    const result = compute(projects, 'g', manifest);
    expect(result.paths[0]).toContain('first');
    expect(result.paths[1]).toContain('second');
    expect(result.paths[2]).toContain('third');
  });

  it('manifest with tilde root expanded via resolveProjectPath', () => {
    const home = os.homedir();
    const projects: Project[] = [{ name: 'app', group: 'code', url: 'u' }];
    const manifest = makeManifest('~/workspace');
    const result = compute(projects, 'code', manifest);
    expect(result.pathByName.get('app')).toBe(`${home}/workspace/code/app`);
  });

  it('multi-group: only active group filtered', () => {
    const projects: Project[] = [
      { name: 'a', group: 'alpha', url: 'u' },
      { name: 'b', group: 'beta', url: 'u' },
      { name: 'c', group: 'beta', url: 'u' },
    ];
    const r1 = compute(projects, 'alpha', makeManifest());
    const r2 = compute(projects, 'beta', makeManifest());
    expect(r1.visible).toHaveLength(1);
    expect(r2.visible).toHaveLength(2);
  });

  it('paths array length matches visible array length', () => {
    const projects: Project[] = [
      { name: 'x', group: 'g', url: 'u' },
      { name: 'y', group: 'g', url: 'u' },
    ];
    const result = compute(projects, 'g', makeManifest());
    expect(result.paths.length).toBe(result.visible.length);
  });

  it('pathByName size matches visible count', () => {
    const projects: Project[] = [
      { name: 'p1', group: 'mygrp', url: 'u' },
      { name: 'p2', group: 'mygrp', url: 'u' },
      { name: 'p3', group: 'other', url: 'u' },
    ];
    const result = compute(projects, 'mygrp', makeManifest());
    expect(result.pathByName.size).toBe(2);
    expect(result.visible.length).toBe(2);
  });
});
