import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';

export function registerRm(program: Command): void {
  program
    .command('rm <name>')
    .description('Remove a project (matches first by name)')
    .option('--group <name>')
    .action(async (name: string, opts: { group?: string }) => {
      const store = new ManifestStore();
      const list = await store.list({ group: opts.group });
      const target = list.find((p) => p.name === name);
      if (!target) {
        console.error(`No project named ${name}`);
        process.exitCode = 1;
        return;
      }
      await store.removeProject(target.name, target.group);
      console.log(`Removed ${target.group}/${target.name}`);
    });
}
