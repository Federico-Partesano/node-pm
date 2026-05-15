import fs from 'node:fs/promises';
import readline from 'node:readline';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';
import type { GitStatus, Progress } from '../shared/types.js';
import { GitError } from '../shared/errors.js';

export type PullResult = { changes: number; insertions: number; deletions: number };

export class GitOps {
  async *clone(url: string, dest: string): AsyncIterable<Progress> {
    const proc = execa('git', ['clone', '--progress', url, dest], { stderr: 'pipe' });
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
}
