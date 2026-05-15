import type { Command } from 'commander';
import path from 'node:path';
import { ManifestStore } from '../../core/manifest.js';

function deriveName(url: string): string {
  return path.basename(url).replace(/\.git$/, '');
}

export function registerAdd(program: Command): void {
  program
    .command('add <url>')
    .description('Add a project to the manifest')
    .option('--group <name>', 'group folder', 'OSS')
    .option('--name <name>', 'override derived name')
    .action(async (url: string, opts: { group: string; name?: string }) => {
      const store = new ManifestStore();
      const name = opts.name ?? deriveName(url);
      await store.addProject({ name, group: opts.group, url });
      console.log(`Added ${opts.group}/${name}`);
    });
}
