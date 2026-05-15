import type { Command } from 'commander';
import { GitOps } from '../../core/git.js';
import { runBulk } from '../run-bulk.js';

export function registerClone(program: Command): void {
  program
    .command('clone [names...]')
    .description('Clone selected projects')
    .option('--all')
    .option('--group <name>')
    .action(async (names: string[], opts: { all?: boolean; group?: string }) => {
      const git = new GitOps();
      await runBulk(
        { label: 'clone', all: opts.all, group: opts.group, names },
        (p, projectPath) => git.clone(p.url, projectPath),
      );
    });
}
