import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { DiscoveredProject } from '../shared/types.js';
import { ScannerError } from '../shared/errors.js';

export type ScanEvent =
  | { kind: 'enter-group'; group: string; path: string }
  | { kind: 'enter-repo'; group: string; name: string; path: string }
  | { kind: 'skip'; reason: 'not-git' | 'not-node' | 'no-remote'; group: string; name: string }
  | { kind: 'found'; project: DiscoveredProject };

export class ProjectScanner {
  async *scanStream(root: string): AsyncIterable<ScanEvent> {
    let groups: string[];
    try {
      groups = await fs.readdir(root);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const reason =
        code === 'ENOENT' ? 'directory does not exist'
        : code === 'EACCES' ? 'permission denied'
        : code === 'ENOTDIR' ? 'path is a file, not a directory'
        : (err as Error).message;
      throw new ScannerError(
        `Cannot scan root: ${reason}\n  path: ${root}`,
        'E_SCAN_ROOT',
        err as Error,
      );
    }
    for (const group of groups) {
      const groupPath = path.join(root, group);
      const stat = await fs.stat(groupPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      yield { kind: 'enter-group', group, path: groupPath };
      const repos = await fs.readdir(groupPath).catch(() => []);
      for (const repo of repos) {
        const repoPath = path.join(groupPath, repo);
        yield { kind: 'enter-repo', group, name: repo, path: repoPath };
        const isRepo = (await fs.stat(path.join(repoPath, '.git')).catch(() => null))?.isDirectory();
        if (!isRepo) {
          yield { kind: 'skip', reason: 'not-git', group, name: repo };
          continue;
        }
        const isNode = !!(await fs.stat(path.join(repoPath, 'package.json')).catch(() => null));
        if (!isNode) {
          yield { kind: 'skip', reason: 'not-node', group, name: repo };
          continue;
        }
        const url = await this.readRemote(repoPath);
        if (!url) {
          yield { kind: 'skip', reason: 'no-remote', group, name: repo };
          continue;
        }
        yield { kind: 'found', project: { name: repo, group, url } };
      }
    }
  }

  async scan(root: string): Promise<DiscoveredProject[]> {
    const discovered: DiscoveredProject[] = [];
    for await (const ev of this.scanStream(root)) {
      if (ev.kind === 'found') discovered.push(ev.project);
    }
    return discovered;
  }

  private async readRemote(repoPath: string): Promise<string | null> {
    try {
      const cfg = await simpleGit(repoPath).getConfig('remote.origin.url');
      return cfg.value || null;
    } catch {
      return null;
    }
  }
}
