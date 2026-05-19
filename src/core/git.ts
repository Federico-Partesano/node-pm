import fs from 'node:fs/promises';
import readline from 'node:readline';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';
import type { GitStatus, Progress } from '../shared/types.js';
import { GitError } from '../shared/errors.js';

export type PullResult = { changes: number; insertions: number; deletions: number };

export class GitOps {
  async *clone(url: string, dest: string): AsyncIterable<Progress> {
    // Idempotency: skip if dest already contains a git repo
    const existingGit = await fs.stat(`${dest}/.git`).catch(() => null);
    if (existingGit?.isDirectory()) {
      yield { phase: 'cloning', percent: 100, message: `already cloned, skipping ${dest}` };
      return;
    }
    // Refuse to clone over a non-empty, non-git directory
    const stats = await fs.stat(dest).catch(() => null);
    if (stats?.isDirectory()) {
      const entries = await fs.readdir(dest).catch(() => [] as string[]);
      if (entries.length > 0) {
        throw new GitError(
          `Destination is non-empty and not a git repo: ${dest}`,
          'E_GIT_CLONE_DEST_DIRTY',
        );
      }
    }
    const proc = execa('git', ['clone', '--progress', '--', url, dest], { stderr: 'pipe' });
    if (!proc.stderr) throw new GitError('git clone has no stderr', 'E_GIT_CLONE');
    const rl = readline.createInterface({ input: proc.stderr });
    const queue: Progress[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    rl.on('line', (line) => {
      const m = /(?:Receiving objects|Resolving deltas):\s+(\d+)%/.exec(line);
      if (m) queue.push({ phase: 'cloning', percent: Number(m[1]), message: line });
      else queue.push({ phase: 'cloning', message: line });
      resolveNext?.();
    });
    proc.then(() => { done = true; resolveNext?.(); }).catch(() => { done = true; resolveNext?.(); });
    while (true) {
      while (queue.length > 0) yield queue.shift()!;
      if (done) break;
      await new Promise<void>((r) => (resolveNext = r));
      resolveNext = null;
    }
    try {
      await proc;
    } catch (err) {
      throw new GitError(`Clone failed: ${(err as Error).message}`, 'E_GIT_CLONE', err as Error);
    }
  }

  async pull(repoPath: string): Promise<PullResult> {
    try {
      const r = await simpleGit(repoPath).pull();
      return {
        changes: r.summary.changes,
        insertions: r.summary.insertions,
        deletions: r.summary.deletions,
      };
    } catch (err) {
      throw new GitError(`Pull failed in ${repoPath}`, 'E_GIT_PULL', err as Error);
    }
  }

  async fetch(repoPath: string): Promise<void> {
    try {
      await simpleGit(repoPath).fetch();
    } catch (err) {
      throw new GitError(`Fetch failed in ${repoPath}`, 'E_GIT_FETCH', err as Error);
    }
  }

  async status(repoPath: string): Promise<GitStatus> {
    const exists = !!(await fs.stat(repoPath).catch(() => null));
    if (!exists) {
      return { branch: null, dirty: false, ahead: 0, behind: 0, exists: false };
    }
    try {
      const s = await simpleGit(repoPath).status();
      return {
        branch: s.current ?? null,
        dirty: !s.isClean(),
        ahead: s.ahead,
        behind: s.behind,
        exists: true,
      };
    } catch (err) {
      throw new GitError(`Status failed in ${repoPath}`, 'E_GIT_STATUS', err as Error);
    }
  }

  async headSha(repo: string): Promise<string> {
    try {
      return (await simpleGit(repo).revparse(['HEAD'])).trim();
    } catch (err) {
      throw new GitError(`headSha failed in ${repo}`, 'E_GIT_HEAD_SHA', err as Error);
    }
  }

  async currentBranch(repo: string): Promise<string> {
    try {
      const s = await simpleGit(repo).status();
      if (s.current) return s.current;
      const sha = await this.headSha(repo);
      return sha.slice(0, 7);
    } catch (err) {
      throw new GitError(`currentBranch failed in ${repo}`, 'E_GIT_BRANCH', err as Error);
    }
  }

  async diffHead(repo: string): Promise<string> {
    try {
      const r = await execa('git', ['diff', 'HEAD'], { cwd: repo, stripFinalNewline: false });
      return r.stdout;
    } catch (err) {
      throw new GitError(`diffHead failed in ${repo}`, 'E_GIT_DIFF', err as Error);
    }
  }

  async listUntracked(repo: string): Promise<string[]> {
    const r = await execa('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repo });
    return r.stdout.split('\n').filter(Boolean);
  }

  async listIgnored(repo: string, excludePrefixes: string[] = []): Promise<string[]> {
    const r = await execa(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard'],
      { cwd: repo },
    );
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .filter((p) => !excludePrefixes.some((pref) => p === pref || p.startsWith(`${pref}/`)));
  }

  async listStashes(
    repo: string,
  ): Promise<{ idx: number; message: string; includesUntracked: boolean }[]> {
    const r = await execa('git', ['stash', 'list', '--format=%gd|%s'], { cwd: repo });
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [ref, ...rest] = line.split('|');
        const message = rest.join('|');
        const m = /stash@\{(\d+)\}/.exec(ref);
        const idx = m ? Number(m[1]) : -1;
        return {
          idx,
          message,
          includesUntracked: /WIP on|--include-untracked|untracked/i.test(message),
        };
      });
  }

  async stashPatch(repo: string, idx: number): Promise<string> {
    const r = await execa(
      'git',
      ['stash', 'show', '-p', '--include-untracked', `stash@{${idx}}`],
      { cwd: repo, stripFinalNewline: false },
    );
    return r.stdout;
  }

  async resetHard(repo: string, sha: string): Promise<void> {
    try {
      await simpleGit(repo).reset(['--hard', sha]);
    } catch (err) {
      throw new GitError(`resetHard ${sha} failed in ${repo}`, 'E_GIT_RESET', err as Error);
    }
  }

  async applyDiff(repo: string, patch: string): Promise<void> {
    if (!patch) return;
    await execa('git', ['apply', '--3way', '--whitespace=nowarn', '-'], {
      cwd: repo,
      input: patch,
    });
  }

  async applyStashPatch(repo: string, patch: string): Promise<void> {
    if (!patch) return;
    await execa('git', ['apply', '--3way', '--whitespace=nowarn', '-'], {
      cwd: repo,
      input: patch,
    });
  }

  async checkoutBranch(repo: string, branch: string): Promise<void> {
    try {
      await simpleGit(repo).checkout(branch);
    } catch {
      await simpleGit(repo).checkoutLocalBranch(branch);
    }
  }

  async lsRemoteHas(repo: string, branch: string): Promise<boolean> {
    try {
      const r = await execa('git', ['ls-remote', '--heads', 'origin', branch], { cwd: repo });
      return r.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
