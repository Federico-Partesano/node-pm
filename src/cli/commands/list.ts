import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List projects')
    .option('--group <name>')
    .option('--tag <name>')
    .option('--json', 'print as JSON')
    .action(async (opts: { group?: string; tag?: string; json?: boolean }) => {
      const store = new ManifestStore();
      const list = await store.list({ group: opts.group, tag: opts.tag });
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      for (const p of list) console.log(`${p.group}/${p.name}\t${p.url}`);
    });
}
