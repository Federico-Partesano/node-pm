import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';
import { GitOps } from '../../src/core/git.js';
import { SnapshotEngine } from '../../src/core/snapshot.js';
import {
  openZipBlobStoreReader,
  openZipBlobStoreWriter,
} from '../../src/core/blob-store.js';

let workspace: string;
let upstream: string;
let work: string;
let snapshotPath: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-rt-'));
  upstream = path.join(workspace, 'upstream.git');
  await execa('git', ['init', '--bare', upstream]);
  work = path.join(workspace, 'work');
  await fs.mkdir(work);
  const sg = simpleGit(work);
  await sg.init();
  await sg.addConfig('user.email', 't@t');
  await sg.addConfig('user.name', 'T');
  await fs.writeFile(path.join(work, 'tracked.txt'), 'hello\n');
  await sg.add('tracked.txt');
  await sg.commit('init');
  await sg.addRemote('origin', upstream);
  // Push whatever the default branch is named locally to the upstream
  const initialBranch = (await sg.status()).current ?? 'master';
  await sg.push('origin', initialBranch, ['--set-upstream']);

  await fs.writeFile(path.join(work, '.gitignore'), '.env\nnode_modules/\n');
  await fs.writeFile(path.join(work, '.env'), 'SECRET=abc\n');
  await fs.writeFile(path.join(work, 'note.png'), crypto.randomBytes(1024));
  await fs.writeFile(path.join(work, 'tracked.txt'), 'hello\nchanged\n');

  snapshotPath = path.join(workspace, 'roundtrip.npmsnap');
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Snapshot roundtrip', () => {
  it('captures tracked diff + untracked + gitignored and restores byte-exact', async () => {
    const project = { name: 'work', group: 'g', url: upstream };
    const engine = new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) => openZipBlobStoreWriter(p),
      openReader: (p) => openZipBlobStoreReader(p),
      resolveProjectPath: () => work,
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });

    for await (const _ of engine.create({
      projects: [project],
      rootDir: workspace,
      snapshotPath,
    })) {
      void _;
    }

    const restoredRoot = path.join(workspace, 'restored');
    const restoredWork = path.join(restoredRoot, 'g', 'work');
    const reader = await openZipBlobStoreReader(snapshotPath);
    const metaRaw = await reader.readMetadata('snapshot.json');
    const meta = JSON.parse(metaRaw);

    const engine2 = new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) => openZipBlobStoreWriter(p),
      openReader: () => Promise.resolve(reader),
      resolveProjectPath: (_r, p) => path.join(restoredRoot, p.group, p.name),
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });
    for await (const _ of engine2.restore({
      snapshot: meta,
      snapshotPath,
      rootDir: restoredRoot,
      onConflict: async () => 'overwrite',
    })) {
      void _;
    }

    expect(await fs.readFile(path.join(restoredWork, 'tracked.txt'), 'utf8')).toBe(
      'hello\nchanged\n',
    );
    expect(await fs.readFile(path.join(restoredWork, '.env'), 'utf8')).toBe(
      'SECRET=abc\n',
    );
    const png = await fs.readFile(path.join(restoredWork, 'note.png'));
    const origPng = await fs.readFile(path.join(work, 'note.png'));
    expect(png.equals(origPng)).toBe(true);
  }, 60000);
});
