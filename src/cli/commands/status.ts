import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { GitOps } from '../../core/git.js';
import { selectProjects } from '../bulk.js';

export function registerStatus(program: Command): void {
  program
    .command('status [names...]')
    .description('Show git status across projects')
    .option('--all')
    .option('--group <name>')
    .option('--json')
    .action(async (names: string[], opts: { all?: boolean; group?: string; json?: boolean }) => {
      const store = new ManifestStore();
      await store.load();
      const targets = await selectProjects(store, { all: opts.all, group: opts.group, names });
      if (targets.length === 0) { console.error('No projects matched'); process.exitCode = 1; return; }
      const git = new GitOps();
      const out = await Promise.all(targets.map(async (p) => ({
        name: p.name, group: p.group, status: await git.status(store.resolvePath(p)),
      })));
      if (opts.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      for (const r of out) {
        const flags = [
          r.status.dirty ? 'dirty' : 'clean',
          r.status.ahead ? `↑${r.status.ahead}` : '',
          r.status.behind ? `↓${r.status.behind}` : '',
          r.status.exists ? '' : 'missing',
        ].filter(Boolean).join(' ');
        console.log(`${r.group}/${r.name}\t${r.status.branch ?? '-'}\t${flags}`);
      }
    });
}
