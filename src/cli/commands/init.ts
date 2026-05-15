import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { getDefaultRoot } from '../../shared/paths.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create an empty manifest')
    .option('--root <path>', 'project root directory', getDefaultRoot())
    .action(async (opts: { root: string }) => {
      const store = new ManifestStore();
      await store.save({ version: 1, root: opts.root, concurrency: 5, projects: [] });
      console.log(`Initialized manifest with root ${opts.root}`);
    });
}
