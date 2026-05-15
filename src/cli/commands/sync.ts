import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { GistSync } from '../../core/sync.js';

export function registerSync(program: Command): void {
  const sync = program.command('sync').description('Sync manifest with a GitHub Gist');

  sync
    .command('push')
    .description('Push local manifest to gist')
    .action(async () => {
      const store = new ManifestStore();
      const m = await store.load();
      const out = await new GistSync().push(m, './node-pm.backup.json');
      m.sync = { gistId: out.gistId, lastSync: new Date().toISOString() };
      await store.save(m);
      console.log(`Pushed to ${out.url}`);
    });

  sync
    .command('pull <gistId>')
    .description('Pull manifest from gist')
    .action(async (gistId: string) => {
      const store = new ManifestStore();
      const fetched = await new GistSync().pull(gistId);
      fetched.sync = { gistId, lastSync: new Date().toISOString() };
      await store.save(fetched);
      console.log(`Pulled manifest from ${gistId}`);
    });
}
