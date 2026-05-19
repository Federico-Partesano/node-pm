import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

vi.mock('env-paths', () => ({
  default: () => ({ config: '/fake/config/node-pm' }),
}));
vi.mock('platform-folders', () => ({
  getDocumentsFolder: () => '/fake/Documents',
}));

import {
  getConfigDir,
  getManifestPath,
  getDefaultRoot,
  getDefaultSnapshotDir,
  expandHome,
  resolveProjectPath,
} from '../../src/shared/paths.js';

const home = os.homedir();

// ---------------------------------------------------------------------------
// getConfigDir
// ---------------------------------------------------------------------------

describe('getConfigDir', () => {
  it('returns the mocked config directory', () => {
    expect(getConfigDir()).toBe('/fake/config/node-pm');
  });
});

// ---------------------------------------------------------------------------
// getManifestPath
// ---------------------------------------------------------------------------

describe('getManifestPath', () => {
  it('always ends with projects.json', () => {
    expect(getManifestPath()).toMatch(/projects\.json$/);
  });

  it('is rooted under the config dir', () => {
    expect(getManifestPath()).toBe(path.join('/fake/config/node-pm', 'projects.json'));
  });
});

// ---------------------------------------------------------------------------
// getDefaultRoot
// ---------------------------------------------------------------------------

describe('getDefaultRoot', () => {
  it('joins the documents folder with "projects"', () => {
    expect(getDefaultRoot()).toBe(path.join('/fake/Documents', 'projects'));
  });

  it('ends with "projects" segment', () => {
    const parts = getDefaultRoot().split(path.sep);
    expect(parts[parts.length - 1]).toBe('projects');
  });
});

// ---------------------------------------------------------------------------
// expandHome
// ---------------------------------------------------------------------------

describe('getDefaultSnapshotDir', () => {
  it('returns a path ending in node-pm/snapshots', () => {
    const p = getDefaultSnapshotDir();
    expect(p.replace(/\\/g, '/')).toMatch(/node-pm\/snapshots$/);
  });

  it('is rooted under the config dir', () => {
    expect(getDefaultSnapshotDir()).toBe(path.join('/fake/config/node-pm', 'snapshots'));
  });
});

describe('expandHome', () => {
  it('expands bare ~ to homedir', () => {
    expect(expandHome('~')).toBe(home);
  });

  it('expands ~/foo to join(home, foo)', () => {
    expect(expandHome('~/foo')).toBe(path.join(home, 'foo'));
  });

  it('expands ~/nested/path correctly', () => {
    expect(expandHome('~/a/b/c')).toBe(path.join(home, 'a', 'b', 'c'));
  });

  it('expands ~\\foo (Windows-style backslash) to join(home, foo)', () => {
    expect(expandHome('~\\foo')).toBe(path.join(home, 'foo'));
  });

  it('leaves absolute path unchanged', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path');
  });

  it('leaves relative path unchanged', () => {
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  it('returns empty string unchanged', () => {
    expect(expandHome('')).toBe('');
  });

  it('leaves ~user unchanged (only ~/ and ~\\ are expanded)', () => {
    // ~username is NOT supported; should return as-is
    expect(expandHome('~user')).toBe('~user');
  });

  it('leaves ~-other unchanged', () => {
    expect(expandHome('~-other')).toBe('~-other');
  });
});

// ---------------------------------------------------------------------------
// resolveProjectPath
// ---------------------------------------------------------------------------

describe('resolveProjectPath', () => {
  const project = {
    name: 'repo-blessed',
    group: 'PERSONALE',
    url: 'git@github.com:user/repo.git',
  };

  it('joins root + group + name', () => {
    expect(resolveProjectPath('/srv/repos', project)).toBe(
      path.join('/srv/repos', 'PERSONALE', 'repo-blessed'),
    );
  });

  it('expands ~ in the root before joining', () => {
    expect(resolveProjectPath('~', project)).toBe(
      path.join(home, 'PERSONALE', 'repo-blessed'),
    );
  });

  it('expands ~/path root before joining', () => {
    expect(resolveProjectPath('~/projects', project)).toBe(
      path.join(home, 'projects', 'PERSONALE', 'repo-blessed'),
    );
  });

  it('works with backslash-style ~ root', () => {
    // ~\projects should be treated the same as ~/projects
    expect(resolveProjectPath('~\\projects', project)).toBe(
      path.join(home, 'projects', 'PERSONALE', 'repo-blessed'),
    );
  });

  it('respects different group and name in the project', () => {
    const other = { name: 'cli-tool', group: 'work', url: 'https://x.com/r.git' };
    expect(resolveProjectPath('/data', other)).toBe(path.join('/data', 'work', 'cli-tool'));
  });
});
