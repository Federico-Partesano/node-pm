import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { PackageManager } from '../../core/pm.js';
import { TaskQueue } from '../../core/queue.js';
import { selectProjects } from '../bulk.js';

export function registerInstall(program: Command): void {
  program
    .command('install [names...]')
    .description('Install dependencies for selected projects')
    .option('--all')
    .option('--group <name>')
    .action(async (names: string[], opts: { all?: boolean; group?: string }) => {
      const store = new ManifestStore();
      const m = await store.load();
      const targets = await selectProjects(store, { all: opts.all, group: opts.group, names });
      if (targets.length === 0) { console.error('No projects matched'); process.exitCode = 1; return; }
      const pm = new PackageManager();
      const queue = new TaskQueue(m.concurrency);
      let ok = 0, fail = 0;
      queue.on('task:done', () => ok++);
      queue.on('task:error', () => fail++);
      await Promise.all(targets.map((p) => queue.add(`install:${p.name}`, () => pm.install(store.resolvePath(p)))));
      console.log(`install done: ${ok} ok, ${fail} failed`);
      if (fail > 0) process.exitCode = 2;
    });
}
