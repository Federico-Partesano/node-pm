import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { ProjectScanner } from '../../core/scanner.js';
import { expandHome } from '../../shared/paths.js';

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Populate manifest from filesystem')
    .option('--root <path>', 'override root for this scan')
    .action(async (opts: { root?: string }) => {
      const store = new ManifestStore();
      const m = await store.load();
      const root = opts.root ?? m.root;
      const found = await new ProjectScanner().scan(expandHome(root));
      for (const p of found) await store.addProject(p);
      console.log(`Scanned ${found.length} project(s) under ${root}`);
    });
}
