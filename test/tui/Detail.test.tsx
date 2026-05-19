import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Detail } from '../../src/tui/panels/Detail.js';
import type { Project } from '../../src/shared/types.js';

const mkProject = (overrides: Partial<Project> = {}): Project => ({
  name: 'my-project',
  group: 'my-group',
  url: 'https://github.com/org/my-project',
  ...overrides,
});

describe('Detail panel', () => {
  it('shows project info and favorite scripts', () => {
    const { lastFrame } = render(
      <Detail
        project={{
          name: 'a', group: 'g', url: 'git@x:a/a.git',
          scripts: { favorites: ['dev', 'test'] },
        }}
        path="/r/g/a"
        pmName="pnpm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('git@x:a/a.git');
    expect(out).toContain('/r/g/a');
    expect(out).toContain('pnpm');
    expect(out).toContain('dev');
    expect(out).toContain('test');
  });

  it('shows empty state when no project is selected', () => {
    const { lastFrame } = render(<Detail project={null} path={null} pmName={null} />);
    expect(lastFrame()).toMatch(/no project/i);
  });

  it('null project shows "No project selected" message', () => {
    const { lastFrame } = render(<Detail project={null} path={null} pmName={null} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('No project selected');
  });

  it('project with no scripts renders without errors and without favs row', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ scripts: undefined })}
        path="/some/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).not.toContain('Favs');
  });

  it('project with empty favorites array does not render favs row', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ scripts: { favorites: [] } })}
        path="/some/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).not.toContain('Favs');
  });

  it('project with multiple favorites lists all of them inline', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ scripts: { favorites: ['build', 'test', 'lint', 'dev'] } })}
        path="/some/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Favs');
    expect(out).toContain('build');
    expect(out).toContain('test');
    expect(out).toContain('lint');
    expect(out).toContain('dev');
  });

  it('path null renders a dash placeholder', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject()}
        path={null}
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Path');
    // Should show '—' (em dash) when path is null
    expect(out).toContain('—');
  });

  it('pmName null renders a dash placeholder', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject()}
        path="/some/path"
        pmName={null}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('PM');
    expect(out).toContain('—');
  });

  it('pmName npm is rendered', () => {
    const { lastFrame } = render(
      <Detail project={mkProject()} path="/p" pmName="npm" />,
    );
    expect(lastFrame() ?? '').toContain('npm');
  });

  it('pmName pnpm is rendered', () => {
    const { lastFrame } = render(
      <Detail project={mkProject()} path="/p" pmName="pnpm" />,
    );
    expect(lastFrame() ?? '').toContain('pnpm');
  });

  it('pmName yarn is rendered', () => {
    const { lastFrame } = render(
      <Detail project={mkProject()} path="/p" pmName="yarn" />,
    );
    expect(lastFrame() ?? '').toContain('yarn');
  });

  it('pmName bun is rendered', () => {
    const { lastFrame } = render(
      <Detail project={mkProject()} path="/p" pmName="bun" />,
    );
    expect(lastFrame() ?? '').toContain('bun');
  });

  it('panel title shows group/name', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ name: 'repo-xyz', group: 'team-abc' })}
        path="/some/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('team-abc');
    expect(out).toContain('repo-xyz');
  });

  it('long URL does not crash render', () => {
    const longUrl = 'https://github.com/organization-with-very-long-name/repository-with-very-long-name-that-is-quite-extended.git';
    const { lastFrame } = render(
      <Detail
        project={mkProject({ url: longUrl })}
        path="/some/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    // At least part of the URL should appear
    expect(out).toContain('github.com');
  });

  it('renders Remote field with url', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ url: 'git@github.com:user/repo.git' })}
        path="/path"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Remote');
    expect(out).toContain('git@github.com:user/repo.git');
  });

  it('renders Path field with path value', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject()}
        path="/home/user/projects/my-group/my-project"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Path');
    expect(out).toContain('/home/user/projects/my-group/my-project');
  });

  it('single favorite script renders inline', () => {
    const { lastFrame } = render(
      <Detail
        project={mkProject({ scripts: { favorites: ['start'] } })}
        path="/p"
        pmName="npm"
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Favs');
    expect(out).toContain('start');
  });
});
