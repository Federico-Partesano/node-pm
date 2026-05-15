import type { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ManifestSchema } from '../../shared/types.js';
import { ManifestStore } from '../../core/manifest.js';

export function registerImport(program: Command): void {
  program
    .command('import <file>')
    .description('Load a JSON snapshot and merge it into the manifest')
    .option('--replace', 'replace the manifest entirely instead of merging')
    .action(async (file: string, opts: { replace?: boolean }) => {
      const source = path.resolve(file);
      const raw = await fs.readFile(source, 'utf8');
      const parsed = ManifestSchema.parse(JSON.parse(raw));
      const store = new ManifestStore();

      if (opts.replace) {
        await store.save(parsed);
        console.log(`Replaced manifest with ${parsed.projects.length} project(s) from ${source}`);
        return;
      }

      let added = 0;
      for (const p of parsed.projects) {
        await store.addProject(p);
        added++;
      }
      console.log(`Imported ${added} project(s) from ${source} (merged with existing)`);
    });
}
