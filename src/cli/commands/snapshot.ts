import type { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ManifestStore } from '../../core/manifest.js';
import { GitOps } from '../../core/git.js';
import { SnapshotEngine } from '../../core/snapshot.js';
import {
  openZipBlobStoreWriter,
  openDirBlobStoreWriter,
  openZipBlobStoreReader,
  openDirBlobStoreReader,
} from '../../core/blob-store.js';
import { scanForSnapshots } from '../../core/snapshot-scanner.js';
import { getDefaultSnapshotDir, expandHome } from '../../shared/paths.js';
import { SnapshotSchema } from '../../shared/types.js';
import type { Project } from '../../shared/types.js';

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function pickProjects(
  store: ManifestStore,
  names: string[],
  opts: { all?: boolean; group?: string },
): Promise<Project[]> {
  const all = await store.list({ group: opts.group });
  if (opts.all) return all;
  if (names.length === 0)
    throw new Error('Specify project names or --all');
  return all.filter((p) => names.includes(p.name));
}

export function registerSnapshot(program: Command): void {
  const cmd = program
    .command('snapshot')
    .description('Capture/restore project working state');

  cmd
    .command('create [names...]')
    .description('Snapshot the working state of selected projects into a .npmsnap zip')
    .option('--all', 'snapshot every project in the manifest')
    .option('--group <g>', 'snapshot only projects in a group')
    .option('--out <path>', 'explicit output path')
    .option('--label <s>', 'optional label suffix')
    .option('--no-zip', 'write a loose directory instead of the .npmsnap zip')
    .action(
      async (
        names: string[],
        opts: {
          all?: boolean;
          group?: string;
          out?: string;
          label?: string;
          zip?: boolean;
        },
      ) => {
        const store = new ManifestStore();
        const manifest = await store.load();
        const projects = await pickProjects(store, names, opts);
        if (projects.length === 0) {
          console.log('No projects selected.');
          return;
        }

        const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
        await fs.mkdir(dir, { recursive: true });
        const stamp = ts();
        const label = opts.label ? `-${opts.label}` : '';
        const defaultName =
          opts.zip === false ? `${stamp}${label}` : `${stamp}${label}.npmsnap`;
        const out = opts.out ?? path.join(dir, defaultName);

        const engine = new SnapshotEngine({
          git: new GitOps(),
          openWriter: (p) =>
            opts.zip === false ? openDirBlobStoreWriter(p) : openZipBlobStoreWriter(p),
          openReader: (p) =>
            p.endsWith('.npmsnap')
              ? openZipBlobStoreReader(p)
              : openDirBlobStoreReader(p),
          resolveProjectPath: (_root, proj) =>
            path.join(expandHome(manifest.root), proj.group, proj.name),
          destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
          removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
        });

        for await (const ev of engine.create({
          projects,
          rootDir: manifest.root,
          snapshotPath: out,
          label: opts.label,
        })) {
          if (ev.kind === 'log') console.log(`[${ev.level}] ${ev.message}`);
          else if (ev.kind === 'phase')
            console.log(`-- ${ev.project.group}/${ev.project.name}: ${ev.phase}`);
          else if (ev.kind === 'project-error')
            console.log(`!! ${ev.project.group}/${ev.project.name}: ${ev.error}`);
          else if (ev.kind === 'done')
            console.log(`OK  snapshot written to ${ev.path}`);
        }
      },
    );

  cmd
    .command('restore <path>')
    .description('Restore a snapshot from a .npmsnap archive or a snapshot directory')
    .option('--only <name>', 'restore only one project from the snapshot')
    .option('--on-conflict <mode>', 'skip|overwrite|abort (default: prompt)')
    .action(
      async (
        snapshotPath: string,
        opts: { only?: string; onConflict?: 'skip' | 'overwrite' | 'abort' },
      ) => {
        const store = new ManifestStore();
        const manifest = await store.load();
        const reader = snapshotPath.endsWith('.npmsnap')
          ? await openZipBlobStoreReader(snapshotPath)
          : await openDirBlobStoreReader(snapshotPath);
        const raw = await reader.readMetadata('snapshot.json');
        const snapshot = SnapshotSchema.parse(JSON.parse(raw));
        if (opts.only)
          snapshot.projects = snapshot.projects.filter((p) => p.name === opts.only);

        const engine = new SnapshotEngine({
          git: new GitOps(),
          openWriter: (p) => openZipBlobStoreWriter(p),
          openReader: () => Promise.resolve(reader),
          resolveProjectPath: (root, proj) =>
            path.join(expandHome(root), proj.group, proj.name),
          destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
          removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
        });

        const promptDecision = async (): Promise<'skip' | 'overwrite' | 'abort'> => {
          if (opts.onConflict) return opts.onConflict;
          process.stdout.write('Dest exists. [s]kip / [o]verwrite / [a]bort? ');
          const input = await new Promise<string>((res) =>
            process.stdin.once('data', (b) =>
              res(b.toString().trim().toLowerCase()),
            ),
          );
          return input.startsWith('o')
            ? 'overwrite'
            : input.startsWith('a')
              ? 'abort'
              : 'skip';
        };

        for await (const ev of engine.restore({
          snapshot,
          snapshotPath,
          rootDir: manifest.root,
          onConflict: promptDecision,
        })) {
          if (ev.kind === 'log') console.log(`[${ev.level}] ${ev.message}`);
          else if (ev.kind === 'phase')
            console.log(`-- ${ev.project.group}/${ev.project.name}: ${ev.phase}`);
          else if (ev.kind === 'project-error')
            console.log(`!! ${ev.project.group}/${ev.project.name}: ${ev.error}`);
          else if (ev.kind === 'done') console.log('OK  restore complete');
        }
      },
    );

  cmd
    .command('list')
    .description(
      'List snapshots in snapshotDir (or scan the filesystem with --global / --scan)',
    )
    .option('--global', 'scan $HOME recursively')
    .option('--scan <root>', 'scan an arbitrary directory recursively')
    .action(async (opts: { global?: boolean; scan?: string }) => {
      const store = new ManifestStore();
      const manifest = await store.load();
      const dir = opts.scan
        ? expandHome(opts.scan)
        : opts.global
          ? os.homedir()
          : expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
      const files = await scanForSnapshots(dir);
      files.sort((a, b) => (a < b ? 1 : -1));
      for (const f of files) console.log(f);
      if (files.length === 0) console.log(`(no snapshots under ${dir})`);
    });
}
