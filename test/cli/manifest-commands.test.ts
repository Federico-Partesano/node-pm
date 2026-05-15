import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import path from 'node:path';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});
vi.mock('write-file-atomic', () => ({
  default: async (p: string, data: string) => {
    const { fs } = await import('memfs');
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
  },
}));
vi.mock('../../src/shared/paths.js', () => ({
  getManifestPath: () => '/cfg/projects.json',
  getDefaultRoot: () => '/r',
  getConfigDir: () => '/cfg',
  expandHome: (s: string) => s,
}));

// Scan mock returns two projects
const scanResults = [
  { name: 'a', group: 'g', url: 'git@x:a/a.git' },
  { name: 'b', group: 'g', url: 'git@x:b/b.git' },
];
vi.mock('../../src/core/scanner.js', () => ({
  ProjectScanner: class {
    async scan() {
      return scanResults;
    }
  },
}));

import { runCli } from '../../src/cli/index.js';

beforeEach(() => vol.reset());

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe('CLI manifest commands — init', () => {
  it('creates an empty manifest', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/r');
    expect(m.projects).toEqual([]);
  });

  it('uses default root when --root is absent', async () => {
    await runCli(['node', 'pm', 'init']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    // getDefaultRoot() mock returns '/r'
    expect(m.root).toBe('/r');
  });

  it('persists a custom root', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/custom']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/custom');
  });

  it('re-init overwrites previous manifest (last-write-wins)', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/first']);
    await runCli(['node', 'pm', 'add', 'git@x:z/z.git', '--group', 'g']);
    // Second init clears projects and changes root
    await runCli(['node', 'pm', 'init', '--root', '/second']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.root).toBe('/second');
    expect(m.projects).toEqual([]);
  });

  it('prints the root to stdout', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'init', '--root', '/myroot']);
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('/myroot');
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------
describe('CLI manifest commands — scan', () => {
  it('populates manifest from filesystem', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'scan']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.map((p: any) => p.name).sort()).toEqual(['a', 'b']);
  });

  it('is idempotent: running twice yields same result', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    await runCli(['node', 'pm', 'scan']);
    await runCli(['node', 'pm', 'scan']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects).toHaveLength(2);
  });

  it('deduplicates by name+group when merging with existing manifest', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    // Pre-populate project 'a' in group 'g' with an old URL — scanner also finds name 'a' in group 'g'
    // Use --name 'a' so the derived name matches what the scanner returns
    await runCli(['node', 'pm', 'add', 'git@x:a/a-old.git', '--group', 'g', '--name', 'a']);
    await runCli(['node', 'pm', 'scan']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    // Still exactly 2 projects, not 3
    expect(m.projects).toHaveLength(2);
  });

  it('reports scanned count in stdout', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'scan']);
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/2 project/);
    log.mockRestore();
  });

  it('does not change manifest root when --root override is given', async () => {
    await runCli(['node', 'pm', 'init', '--root', '/stored-root']);
    await runCli(['node', 'pm', 'scan', '--root', '/override']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    // manifest root must still be the original stored root
    expect(m.root).toBe('/stored-root');
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
describe('CLI manifest commands — list', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
  });

  it('empty manifest produces no output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list']);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('--json prints valid parsable JSON', async () => {
    await runCli(['node', 'pm', 'scan']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list', '--json']);
    expect(log).toHaveBeenCalled();
    const json = JSON.parse(log.mock.calls.at(-1)![0] as string);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
    log.mockRestore();
  });

  it('--group filter narrows results', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:p/p.git', '--group', 'private']);
    await runCli(['node', 'pm', 'add', 'git@x:o/o.git', '--group', 'oss']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list', '--group', 'private']);
    const lines = log.mock.calls.map((c: any[]) => c[0] as string);
    expect(lines.every((l) => l.startsWith('private/'))).toBe(true);
    expect(lines).toHaveLength(1);
    log.mockRestore();
  });

  it('--tag filter narrows results', async () => {
    // Add project via manifest manipulation — tags only come from scan data
    await runCli(['node', 'pm', 'scan']); // a and b are added without tags
    // Manually inject a tagged project by reading + rewriting the file
    const { fs } = await import('memfs');
    const raw = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    raw.projects.push({ name: 'tagged', group: 'g', url: 'git@x:t/t.git', tags: ['featured'] });
    await fs.promises.writeFile('/cfg/projects.json', JSON.stringify(raw));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list', '--tag', 'featured']);
    const lines = log.mock.calls.map((c: any[]) => c[0] as string);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('tagged');
    log.mockRestore();
  });

  it('--group + --tag is AND (both must match)', async () => {
    const { fs } = await import('memfs');
    const raw = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    raw.projects.push({ name: 'tagged-g', group: 'g', url: 'u1', tags: ['featured'] });
    raw.projects.push({ name: 'tagged-h', group: 'h', url: 'u2', tags: ['featured'] });
    raw.projects.push({ name: 'untagged-g', group: 'g', url: 'u3' });
    await fs.promises.writeFile('/cfg/projects.json', JSON.stringify(raw));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list', '--group', 'g', '--tag', 'featured']);
    const lines = log.mock.calls.map((c: any[]) => c[0] as string);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('tagged-g');
    log.mockRestore();
  });

  it('plain mode prints one project per line as group/name\\turl', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:mypkg/repo.git', '--group', 'oss']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list']);
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]?.[0] as string;
    expect(line).toBe('oss/repo\tgit@x:mypkg/repo.git');
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------
describe('CLI manifest commands — add', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
  });

  it('default group is OSS when --group is absent', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    const p = m.projects.find((x: any) => x.name === 'c');
    expect(p?.group).toBe('OSS');
  });

  it('inserts a project', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'c')).toBeTruthy();
  });

  it('--name overrides derived name', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:org/ugly-name.git', '--group', 'g', '--name', 'pretty']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'pretty')).toBeTruthy();
    expect(m.projects.find((p: any) => p.name === 'ugly-name')).toBeUndefined();
  });

  it('adding existing name+group updates URL (upsert)', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    await runCli(['node', 'pm', 'add', 'git@x:c/c-new.git', '--group', 'g', '--name', 'c']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    const matches = m.projects.filter((p: any) => p.name === 'c' && p.group === 'g');
    expect(matches).toHaveLength(1);
    expect(matches[0].url).toBe('git@x:c/c-new.git');
  });

  it('URL with .git suffix → derived name strips .git', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:org/myrepo.git', '--group', 'g']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'myrepo')).toBeTruthy();
  });

  it('URL without .git suffix → derived name is basename', async () => {
    await runCli(['node', 'pm', 'add', 'https://github.com/org/myrepo', '--group', 'g']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'myrepo')).toBeTruthy();
  });

  it('URL with path components → name is final segment', async () => {
    await runCli(['node', 'pm', 'add', 'https://github.com/deep/nested/path/finalrepo.git', '--group', 'g']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects.find((p: any) => p.name === 'finalrepo')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// rm
// ---------------------------------------------------------------------------
describe('CLI manifest commands — rm', () => {
  beforeEach(async () => {
    await runCli(['node', 'pm', 'init', '--root', '/r']);
  });

  it('removes a project by name', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    await runCli(['node', 'pm', 'rm', 'c']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects).toEqual([]);
  });

  it('without --group removes the first match by listing order', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a1/dup.git', '--group', 'g1']);
    await runCli(['node', 'pm', 'add', 'git@x:a2/dup.git', '--group', 'g2']);
    await runCli(['node', 'pm', 'rm', 'dup']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    // One remains
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0].name).toBe('dup');
  });

  it('with --group only removes within that group', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:a1/dup.git', '--group', 'g1']);
    await runCli(['node', 'pm', 'add', 'git@x:a2/dup.git', '--group', 'g2']);
    await runCli(['node', 'pm', 'rm', 'dup', '--group', 'g2']);
    const { fs } = await import('memfs');
    const m = JSON.parse(await fs.promises.readFile('/cfg/projects.json', 'utf8') as string);
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0].group).toBe('g1');
  });

  it('non-existent name → sets exit 1 and prints to stderr', async () => {
    process.exitCode = 0;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(['node', 'pm', 'rm', 'doesnotexist']);
    expect(process.exitCode).toBe(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('doesnotexist'));
    err.mockRestore();
  });

  it('after rm the project no longer appears in list', async () => {
    await runCli(['node', 'pm', 'add', 'git@x:c/c.git', '--group', 'g']);
    await runCli(['node', 'pm', 'rm', 'c']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'pm', 'list']);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
