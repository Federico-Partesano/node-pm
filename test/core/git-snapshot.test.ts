import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { GitOps } from '../../src/core/git.js';

let repo: string;
let git: GitOps;
beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'git-snap-'));
  const sg = simpleGit(repo);
  await sg.init();
  await sg.addConfig('user.email', 'test@example.com');
  await sg.addConfig('user.name', 'Test');
  await fs.writeFile(path.join(repo, 'a.txt'), 'hello\n');
  await sg.add('a.txt');
  await sg.commit('init');
  git = new GitOps();
});

describe('GitOps snapshot extensions', () => {
  it('headSha returns 40-char SHA', async () => {
    const sha = await git.headSha(repo);
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('currentBranch returns the current branch name', async () => {
    const branch = await git.currentBranch(repo);
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  it('diffHead returns empty string for clean tree', async () => {
    expect(await git.diffHead(repo)).toBe('');
  });

  it('diffHead returns a unified diff for modified tracked files', async () => {
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nworld\n');
    const d = await git.diffHead(repo);
    expect(d).toContain('+world');
  });

  it('listUntracked excludes gitignored', async () => {
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\nnode_modules/\n');
    await fs.writeFile(path.join(repo, 'untracked.txt'), 'x');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'y');
    const list = await git.listUntracked(repo);
    expect(list).toContain('untracked.txt');
    expect(list).toContain('.gitignore');
    expect(list).not.toContain('ignored.txt');
  });

  it('listIgnored returns ignored files but excludes node_modules paths', async () => {
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\nnode_modules/\n');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'y');
    await fs.mkdir(path.join(repo, 'node_modules'));
    await fs.writeFile(path.join(repo, 'node_modules', 'pkg.txt'), 'z');
    const list = await git.listIgnored(repo, ['node_modules']);
    expect(list).toContain('ignored.txt');
    expect(list.some((p) => p.startsWith('node_modules/'))).toBe(false);
  });

  it('listStashes returns metadata for each stash and stashPatch returns a unified diff', async () => {
    const sg = simpleGit(repo);
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nstash-me\n');
    await sg.stash(['push', '-m', 'first']);
    await fs.writeFile(path.join(repo, 'b.txt'), 'second');
    await sg.stash(['push', '--include-untracked', '-m', 'second']);

    const stashes = await git.listStashes(repo);
    expect(stashes).toHaveLength(2);
    expect(stashes[0].message).toContain('second');

    const patch = await git.stashPatch(repo, 0);
    expect(patch).toContain('diff');
  });

  it('resetHard moves HEAD to a given SHA', async () => {
    const sg = simpleGit(repo);
    const sha = await git.headSha(repo);
    await fs.writeFile(path.join(repo, 'a.txt'), 'changed\n');
    await sg.add('a.txt');
    await sg.commit('change');
    await git.resetHard(repo, sha);
    expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\n');
  });

  it('applyDiff applies a unified patch to a clean tree', async () => {
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nadded\n');
    const patch = await git.diffHead(repo);
    await simpleGit(repo).checkout(['--', 'a.txt']); // revert
    expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\n');
    await git.applyDiff(repo, patch);
    expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\nadded\n');
  });

  it('checkoutBranch creates a local branch if it does not exist', async () => {
    await git.checkoutBranch(repo, 'feature/new');
    expect(await git.currentBranch(repo)).toBe('feature/new');
  });
});
