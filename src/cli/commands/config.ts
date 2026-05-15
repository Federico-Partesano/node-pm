import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { GistSync } from '../../core/sync.js';

const SETTABLE = ['root', 'concurrency', 'token'] as const;
type Key = (typeof SETTABLE)[number];

export function registerConfig(program: Command): void {
  const config = program.command('config').description('Read or write configuration');

  config
    .command('set <key> <value>')
    .action(async (key: string, value: string) => {
      assertKey(key);
      if (key === 'token') {
        await new GistSync().setToken(value);
        console.log('token saved to keyring');
        return;
      }
      const store = new ManifestStore();
      const m = await store.load();
      if (key === 'root') m.root = value;
      else if (key === 'concurrency') m.concurrency = Number(value);
      await store.save(m);
      console.log(`${key} = ${value}`);
    });

  config
    .command('get <key>')
    .action(async (key: string) => {
      assertKey(key);
      if (key === 'token') {
        const tok = await new GistSync().getToken();
        console.log(tok ? '[present]' : '[missing]');
        return;
      }
      const m = await new ManifestStore().load();
      if (key === 'root') console.log(m.root);
      else if (key === 'concurrency') console.log(String(m.concurrency));
    });
}

function assertKey(k: string): asserts k is Key {
  if (!(SETTABLE as readonly string[]).includes(k)) {
    throw new Error(`Unknown config key: ${k}`);
  }
}
