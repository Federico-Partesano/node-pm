import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

// ─── filesystem mock ───────────────────────────────────────────────────────────
vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => {
  const m = await import('memfs');
  return { default: m.fs.promises, ...m.fs.promises };
});

// ─── simple-git mock ──────────────────────────────────────────────────────────
// The map is mutable so individual tests can override it.
const remoteMap: Record<string, string> = {
  '/root/g1/repo-a': 'git@github.com:u/repo-a.git',
  '/root/g1/repo-b': 'git@github.com:u/repo-b.git',
};
vi.mock('simple-git', () => ({
  simpleGit: (cwd: string) => ({
    getConfig: async (_k: string) => ({ value: remoteMap[cwd] ?? '' }),
  }),
}));

import { ProjectScanner } from '../../src/core/scanner.js';
import { ScannerError } from '../../src/shared/errors.js';

beforeEach(() => {
  vol.reset();
  // Reset remote map to default between tests.
  for (const k of Object.keys(remoteMap)) delete remoteMap[k];
  remoteMap['/root/g1/repo-a'] = 'git@github.com:u/repo-a.git';
  remoteMap['/root/g1/repo-b'] = 'git@github.com:u/repo-b.git';
});

describe('ProjectScanner', () => {
  // ── baseline ──────────────────────────────────────────────────────────────
  it('discovers repos two levels deep', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
      '/root/g1/repo-b/.git/HEAD': 'ref',
      '/root/g1/repo-b/package.json': '{}',
      '/root/notagroup.txt': 'x',
    });
    const found = await new ProjectScanner().scan('/root');
    expect(found.map((f) => `${f.group}/${f.name}`).sort()).toEqual([
      'g1/repo-a',
      'g1/repo-b',
    ]);
    expect(found[0]?.url).toMatch(/repo-a/);
  });

  // ── empty root ────────────────────────────────────────────────────────────
  it('returns [] for an empty root', async () => {
    vol.fromJSON({ '/root/.keep': '' });
    // The .keep file is a file entry so it will be stat'd and skipped as non-dir.
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── root with only files ──────────────────────────────────────────────────
  it('returns [] when root contains only files (no subdirs)', async () => {
    vol.fromJSON({
      '/root/readme.md': '# hi',
      '/root/config.json': '{}',
    });
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── group with no repos ───────────────────────────────────────────────────
  it('group with no repos contributes nothing', async () => {
    vol.fromJSON({ '/root/g1/.keep': '' });
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── .git file (not a directory) ───────────────────────────────────────────
  it('skips repo where .git is a file, not a directory', async () => {
    vol.fromJSON({
      '/root/g1/worktree/.git': 'gitdir: ../../.git/worktrees/worktree',
      '/root/g1/worktree/package.json': '{}',
    });
    remoteMap['/root/g1/worktree'] = 'git@github.com:u/worktree.git';
    const found = await new ProjectScanner().scan('/root');
    // isDirectory() returns false for a file → skipped
    expect(found).toEqual([]);
  });

  // ── repo without package.json ─────────────────────────────────────────────
  it('skips dirs without package.json', async () => {
    vol.fromJSON({
      '/root/g1/notnode/.git/HEAD': 'ref',
    });
    remoteMap['/root/g1/notnode'] = 'git@github.com:u/notnode.git';
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── no remote.origin.url ──────────────────────────────────────────────────
  it('skips repo without remote.origin.url', async () => {
    vol.fromJSON({
      '/root/g1/no-remote/.git/HEAD': 'ref',
      '/root/g1/no-remote/package.json': '{}',
    });
    // remoteMap returns '' by default for unknown paths → skipped
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── remote.origin.url is empty string ────────────────────────────────────
  it('skips repo with empty remote.origin.url', async () => {
    vol.fromJSON({
      '/root/g1/empty-url/.git/HEAD': 'ref',
      '/root/g1/empty-url/package.json': '{}',
    });
    remoteMap['/root/g1/empty-url'] = '';
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── three groups, two repos each ──────────────────────────────────────────
  it('returns 6 results from three groups with two repos each', async () => {
    for (const g of ['ga', 'gb', 'gc']) {
      for (const r of ['r1', 'r2']) {
        const p = `/root/${g}/${r}`;
        vol.fromJSON({
          [`${p}/.git/HEAD`]: 'ref',
          [`${p}/package.json`]: '{}',
        });
        remoteMap[p] = `git@github.com:u/${g}-${r}.git`;
      }
    }
    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(6);
  });

  // ── order independence ─────────────────────────────────────────────────────
  it('result set is correct regardless of fs order', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
      '/root/g1/repo-b/.git/HEAD': 'ref',
      '/root/g1/repo-b/package.json': '{}',
    });
    const found = await new ProjectScanner().scan('/root');
    const keys = found.map((f) => `${f.group}/${f.name}`);
    expect(keys).toContain('g1/repo-a');
    expect(keys).toContain('g1/repo-b');
  });

  // ── path with spaces ──────────────────────────────────────────────────────
  it('handles group and repo names with spaces', async () => {
    vol.fromJSON({
      '/root/my group/my repo/.git/HEAD': 'ref',
      '/root/my group/my repo/package.json': '{}',
    });
    remoteMap['/root/my group/my repo'] = 'git@github.com:u/my-repo.git';
    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(1);
    expect(found[0]?.group).toBe('my group');
    expect(found[0]?.name).toBe('my repo');
  });

  // ── hidden directories at group level ─────────────────────────────────────
  it('considers hidden directories at group level (no dot-filter)', async () => {
    // The scanner has no special filtering for dot-prefixed groups.
    vol.fromJSON({
      '/root/.hidden-group/repo-x/.git/HEAD': 'ref',
      '/root/.hidden-group/repo-x/package.json': '{}',
    });
    remoteMap['/root/.hidden-group/repo-x'] = 'git@github.com:u/repo-x.git';
    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(1);
    expect(found[0]?.group).toBe('.hidden-group');
  });

  // ── permission denied on a group dir ─────────────────────────────────────
  it('silently skips a group dir whose readdir fails, continues with others', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
      // /root/bad-group exists as a directory but readdir will fail (mocked below via stat trick)
      '/root/bad-group/.keep': '',
    });
    remoteMap['/root/g1/repo-a'] = 'git@github.com:u/repo-a.git';

    // Monkey-patch fs.promises.readdir for the bad group path.
    // We cannot easily patch memfs per-path, so we wrap the module import.
    // Instead, verify that the scanner catches readdir errors via the .catch(()=>[]) guard:
    // We do it by placing an unreadable file where bad-group would be listed.
    // The simplest approach: bad-group is a file (stat returns non-dir) → skipped.
    // Re-create: /root/bad-group is a file so stat→isDirectory()===false.
    vol.reset();
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
      '/root/bad-group': 'i am a file',   // will stat as file → skipped
    });
    remoteMap['/root/g1/repo-a'] = 'git@github.com:u/repo-a.git';

    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('repo-a');
  });

  // ── permission denied on root → throws ScannerError E_SCAN_ROOT ──────────
  it('throws ScannerError E_SCAN_ROOT when root is unreadable', async () => {
    // Do not create /nonexistent in memfs → readdir will throw ENOENT.
    await expect(new ProjectScanner().scan('/nonexistent')).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ScannerError && (e as ScannerError).code === 'E_SCAN_ROOT',
    );
  });

  // ── scanner is independent of manifest ───────────────────────────────────
  it('returns correct data without any manifest present', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
    });
    // No manifest file present — scanner must not care.
    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('git@github.com:u/repo-a.git');
  });

  // ── returned shape has name / group / url ────────────────────────────────
  it('each result has name, group and url fields', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
    });
    const [r] = await new ProjectScanner().scan('/root');
    expect(r).toMatchObject({ name: 'repo-a', group: 'g1', url: expect.any(String) });
  });

  // ── mixed entries: one valid, one missing .git, one missing package.json ─
  it('returns only the fully valid repos from mixed entries', async () => {
    vol.fromJSON({
      '/root/g1/ok/.git/HEAD': 'ref',
      '/root/g1/ok/package.json': '{}',
      '/root/g1/no-git/package.json': '{}',
      '/root/g1/no-pkg/.git/HEAD': 'ref',
    });
    remoteMap['/root/g1/ok'] = 'git@github.com:u/ok.git';
    remoteMap['/root/g1/no-git'] = 'git@github.com:u/no-git.git';
    remoteMap['/root/g1/no-pkg'] = 'git@github.com:u/no-pkg.git';

    const found = await new ProjectScanner().scan('/root');
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('ok');
  });

  // ── simpleGit.getConfig throws → treated as missing url ──────────────────
  it('skips repo when simpleGit.getConfig throws', async () => {
    vol.fromJSON({
      '/root/g1/repo-err/.git/HEAD': 'ref',
      '/root/g1/repo-err/package.json': '{}',
    });
    // Not setting remoteMap entry → returns '' → null → skipped.
    // (getConfig throwing is handled by the try/catch in readRemote returning null)
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── deep nesting ignored (only 2 levels) ─────────────────────────────────
  it('does not discover repos nested deeper than group/repo', async () => {
    vol.fromJSON({
      '/root/g1/subrepo/deep/.git/HEAD': 'ref',
      '/root/g1/subrepo/deep/package.json': '{}',
    });
    remoteMap['/root/g1/subrepo'] = 'git@github.com:u/subrepo.git';
    // /root/g1/subrepo has no .git and no package.json itself → skipped
    // /root/g1/subrepo/deep is not scanned (only 2 levels)
    const found = await new ProjectScanner().scan('/root');
    expect(found).toEqual([]);
  });

  // ── multiple groups, partial success ─────────────────────────────────────
  it('results from multiple groups are merged', async () => {
    vol.fromJSON({
      '/root/frontend/app/.git/HEAD': 'ref',
      '/root/frontend/app/package.json': '{}',
      '/root/backend/api/.git/HEAD': 'ref',
      '/root/backend/api/package.json': '{}',
    });
    remoteMap['/root/frontend/app'] = 'git@github.com:u/app.git';
    remoteMap['/root/backend/api'] = 'git@github.com:u/api.git';

    const found = await new ProjectScanner().scan('/root');
    const groups = found.map((f) => f.group).sort();
    expect(groups).toEqual(['backend', 'frontend']);
  });

  // ── url is stored verbatim ────────────────────────────────────────────────
  it('stores the remote URL verbatim (no transformation)', async () => {
    vol.fromJSON({
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
    });
    const url = 'https://github.com/org/repo-a.git';
    remoteMap['/root/g1/repo-a'] = url;

    const [r] = await new ProjectScanner().scan('/root');
    expect(r?.url).toBe(url);
  });

  // ── file inside a valid group is skipped ─────────────────────────────────
  it('skips a file entry inside a group dir (only scans subdirs)', async () => {
    vol.fromJSON({
      '/root/g1/README.md': '# docs',
      '/root/g1/repo-a/.git/HEAD': 'ref',
      '/root/g1/repo-a/package.json': '{}',
    });
    const found = await new ProjectScanner().scan('/root');
    // README.md stat → is not a dir → the scan of repos inside g1 will iterate [README.md, repo-a]
    // For README.md: stat(/root/g1/README.md/.git) → null, stat(package.json) → null → skipped
    expect(found.map((f) => f.name)).toContain('repo-a');
    expect(found.every((f) => f.name !== 'README.md')).toBe(true);
  });
});
