import type { Command } from 'commander';
import { GitOps } from '../../core/git.js';
import { runBulk } from '../run-bulk.js';

export function registerPull(program: Command): void {
  program
    .command('pull [names...]')
    .description('Git pull on selected projects')
    .option('--all')
    .option('--group <name>')
    .action(async (names: string[], opts: { all?: boolean; group?: string }) => {
      const git = new GitOps();
      await runBulk(
        { label: 'pull', all: opts.all, group: opts.group, names },
        (_p, projectPath) => git.pull(projectPath),
      );
    });
}
