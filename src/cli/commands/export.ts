import type { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ManifestStore } from '../../core/manifest.js';

const DEFAULT_FILE = 'node-pm-snapshot.json';

export function registerExport(program: Command): void {
  program
    .command('export [file]')
    .description('Save the manifest as a JSON snapshot for backup or sharing')
    .action(async (file: string | undefined) => {
      const target = path.resolve(file ?? DEFAULT_FILE);
      const m = await new ManifestStore().load();
      // Strip the sync metadata so the snapshot is portable
      const { sync: _sync, ...portable } = m;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(portable, null, 2));
      console.log(`Exported ${m.projects.length} project(s) to ${target}`);
    });
}
