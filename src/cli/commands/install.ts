import type { Command } from 'commander';
import { PackageManager } from '../../core/pm.js';
import { runBulk } from '../run-bulk.js';

export function registerInstall(program: Command): void {
  program
    .command('install [names...]')
    .description('Install dependencies for selected projects')
    .option('--all')
    .option('--group <name>')
    .action(async (names: string[], opts: { all?: boolean; group?: string }) => {
      const pm = new PackageManager();
      await runBulk(
        { label: 'install', all: opts.all, group: opts.group, names },
        (_p, projectPath) => pm.install(projectPath),
      );
    });
}
