import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { DiscoveredProject } from '../shared/types.js';
import { ScannerError } from '../shared/errors.js';

export class ProjectScanner {
  async scan(root: string): Promise<DiscoveredProject[]> {
    let groups: string[];
    try {
      groups = await fs.readdir(root);
    } catch (err) {
      throw new ScannerError(`Cannot read root ${root}`, 'E_SCAN_ROOT', err as Error);
    }
    const discovered: DiscoveredProject[] = [];
    for (const group of groups) {
      const groupPath = path.join(root, group);
      const stat = await fs.stat(groupPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const repos = await fs.readdir(groupPath).catch(() => []);
      for (const repo of repos) {
        const repoPath = path.join(groupPath, repo);
        const isRepo = (await fs.stat(path.join(repoPath, '.git')).catch(() => null))?.isDirectory();
        const isNode = !!(await fs.stat(path.join(repoPath, 'package.json')).catch(() => null));
        if (!isRepo || !isNode) continue;
        const url = await this.readRemote(repoPath);
        if (!url) continue;
        discovered.push({ name: repo, group, url });
      }
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
