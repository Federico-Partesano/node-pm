import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { ScriptRunner } from '../../core/runner.js';
import { selectProjects } from '../bulk.js';

export function registerRun(program: Command): void {
  program
    .command('run <script> [names...]')
    .description('Run an npm script on selected projects (no streaming UI; use TUI for that)')
    .option('--all')
    .option('--group <name>')
    .action(async (script: string, names: string[], opts: { all?: boolean; group?: string }) => {
      const store = new ManifestStore();
      await store.load();
      const targets = await selectProjects(store, { all: opts.all, group: opts.group, names });
      const runner = new ScriptRunner();
      let fail = 0;
      for (const p of targets) {
        const handle = await runner.spawn(p, script, store.resolvePath(p));
        handle.onStdout((l) => console.log(`[${p.name}] ${l}`));
        handle.onStderr((l) => console.error(`[${p.name}] ${l}`));
        await new Promise<void>((resolve) => {
          if (handle.status !== 'running') return resolve();
          const i = setInterval(() => {
            if (handle.status !== 'running') { clearInterval(i); resolve(); }
          }, 50);
        });
        if (handle.exitCode !== 0) fail++;
      }
      if (fail > 0) process.exitCode = 2;
    });
}
