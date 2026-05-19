# Project Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pm snapshot create|restore|list` (CLI + TUI) that captures the working state of selected projects into a single `.npmsnap` zip artifact (HEAD, branch, uncommitted diff, untracked files, gitignored files except `node_modules/`, stashes) and rehydrates it byte-exact into fresh clones.

**Architecture:** A `SnapshotEngine` orchestrator emits a typed event stream. It delegates Git work to an extended `GitOps` and content-addressed file I/O to a `BlobStore` with two backends — `ZipBlobStore` (default, yazl write / yauzl random-access read) and `DirBlobStore` (`--no-zip` debug mode). TUI and CLI render the engine's events. Streaming I/O keeps memory flat even for 200 MB files.

**Tech Stack:** TypeScript (ESM), Node 20+, vitest, ink (TUI), commander (CLI), `simple-git`, `execa`, `yazl`, `yauzl`, `zod`.

**Reference spec:** `docs/superpowers/specs/2026-05-19-project-snapshot-design.md`.

---

## File map

**New files:**
- `src/core/blob-store.ts` — `BlobRef`, `BlobStoreWriter`, `BlobStoreReader` interfaces + `DirBlobStore*` + `ZipBlobStore*` implementations.
- `src/core/snapshot.ts` — `SnapshotEngine` orchestrator + `SnapshotEvent` types.
- `src/core/snapshot-scanner.ts` — filesystem walk for `*.npmsnap`.
- `src/cli/commands/snapshot.ts` — `pm snapshot create|restore|list` registration.
- `src/tui/components/snapshot/ProgressBar.tsx` — ASCII bar.
- `src/tui/components/snapshot/ProjectRow.tsx` — one progress row.
- `src/tui/components/snapshot/LogTail.tsx` — tailing log panel.
- `src/tui/components/snapshot/OverallBar.tsx` — overall progress header.
- `src/tui/pages/SnapshotPage.tsx` — two-mode page (create + restore).
- `src/tui/pages/SettingsPage.tsx` — minimal settings (snapshotDir field).
- `test/core/blob-store.test.ts`
- `test/core/snapshot.test.ts`
- `test/core/snapshot-scanner.test.ts`
- `test/integration/snapshot-roundtrip.test.ts`
- `test/integration/snapshot-cli.test.ts`
- `test/tui/components/snapshot/ProgressBar.test.tsx`
- `test/tui/pages/SnapshotPage.test.tsx`

**Modified files:**
- `package.json` — add `yazl`, `yauzl`, `@types/yauzl`, `@types/yazl` deps.
- `src/shared/types.ts` — add `BlobRefSchema`, `StashEntrySchema`, `ProjectSnapshotSchema`, `SnapshotSchema`; add `snapshotDir` to `ManifestSchema`.
- `src/shared/errors.ts` — add `SnapshotError` class.
- `src/shared/paths.ts` — add `getDefaultSnapshotDir()`.
- `src/core/git.ts` — extend `GitOps` with snapshot-required primitives.
- `src/cli/index.ts` — register snapshot command.
- `src/tui/App.tsx` (or current page router) — register `snapshot` + `settings` pages, link from `HomePage`.
- `src/tui/pages/HomePage.tsx` — add menu entries for Snapshot + Settings.
- `README.md` — document the new commands and security caveat.

---

## Task 1: Add yazl / yauzl dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install yazl@^2.5.1 yauzl@^3.1.3
```

- [ ] **Step 2: Install type defs**

Run:
```bash
npm install --save-dev @types/yazl@^2.4.5 @types/yauzl@^2.10.3
```

- [ ] **Step 3: Verify imports compile**

Create a throwaway `scratch.ts` at the repo root:
```ts
import yazl from 'yazl';
import yauzl from 'yauzl';
console.log(typeof yazl.ZipFile, typeof yauzl.open);
```
Run `npx tsc --noEmit scratch.ts`. Expected: no output (no errors). Then `rm scratch.ts`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add yazl/yauzl for snapshot zip I/O"
```

---

## Task 2: Add SnapshotError class

**Files:**
- Modify: `src/shared/errors.ts`
- Test: `test/shared/errors.test.ts` (skip — these are trivial subclasses, the codebase has no existing test for errors. Just verify via typecheck.)

- [ ] **Step 1: Append new error class**

Add at the end of `src/shared/errors.ts`:
```ts
export class SnapshotError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'SnapshotError';
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/errors.ts
git commit -m "feat(snapshot): add SnapshotError class"
```

---

## Task 3: Add zod schemas for Snapshot

**Files:**
- Modify: `src/shared/types.ts`
- Test: `test/shared/types-snapshot.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/shared/types-snapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  BlobRefSchema,
  StashEntrySchema,
  ProjectSnapshotSchema,
  SnapshotSchema,
} from '../../src/shared/types.js';

describe('snapshot schemas', () => {
  it('BlobRefSchema requires a 64-char hex blob', () => {
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'a'.repeat(64), size: 1 }).success).toBe(true);
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'zzz', size: 1 }).success).toBe(false);
    expect(BlobRefSchema.safeParse({ path: 'x', blob: 'a'.repeat(63), size: 1 }).success).toBe(false);
  });

  it('StashEntrySchema requires message+patch+includesUntracked', () => {
    const ok = StashEntrySchema.safeParse({ message: 'm', patch: 'p', includesUntracked: false });
    expect(ok.success).toBe(true);
  });

  it('ProjectSnapshotSchema accepts a minimal clean project', () => {
    const r = ProjectSnapshotSchema.safeParse({
      name: 'n', group: 'g', url: 'u', branch: 'main', head: 'a'.repeat(40),
      trackedDiff: '', untrackedFiles: [], gitignoredFiles: [], stashes: [],
    });
    expect(r.success).toBe(true);
  });

  it('SnapshotSchema rejects unknown version', () => {
    const r = SnapshotSchema.safeParse({
      version: 2, createdAt: new Date().toISOString(), projects: [],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/shared/types-snapshot.test.ts`
Expected: FAIL — imports do not resolve.

- [ ] **Step 3: Add schemas to types.ts**

Append to `src/shared/types.ts`:
```ts
export const BlobRefSchema = z.object({
  path: z.string(),
  blob: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  mode: z.string().optional(),
});
export type BlobRef = z.infer<typeof BlobRefSchema>;

export const StashEntrySchema = z.object({
  message: z.string(),
  patch: z.string(),
  includesUntracked: z.boolean(),
});
export type StashEntry = z.infer<typeof StashEntrySchema>;

export const ProjectSnapshotSchema = z.object({
  name: z.string(),
  group: z.string(),
  url: z.string(),
  branch: z.string(),
  head: z.string(),
  trackedDiff: z.string(),
  untrackedFiles: z.array(BlobRefSchema),
  gitignoredFiles: z.array(BlobRefSchema),
  stashes: z.array(StashEntrySchema),
  warnings: z.array(z.string()).optional(),
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

export const SnapshotSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  projects: z.array(ProjectSnapshotSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
```

Also extend `ManifestSchema` in the same file: add `snapshotDir: z.string().optional()` before `projects`.

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/shared/types-snapshot.test.ts`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts test/shared/types-snapshot.test.ts
git commit -m "feat(snapshot): add zod schemas + snapshotDir manifest field"
```

---

## Task 4: Add `getDefaultSnapshotDir` helper

**Files:**
- Modify: `src/shared/paths.ts`
- Test: `test/shared/paths.test.ts` (extend, or create if missing)

- [ ] **Step 1: Write failing test**

Append to `test/shared/paths.test.ts` (create the file if it does not exist with `import { describe, it, expect } from 'vitest';` and `import { getDefaultSnapshotDir } from '../../src/shared/paths.js';`):
```ts
describe('getDefaultSnapshotDir', () => {
  it('returns a path ending in node-pm/snapshots', () => {
    const p = getDefaultSnapshotDir();
    expect(p.replace(/\\/g, '/')).toMatch(/node-pm\/snapshots$/);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/shared/paths.test.ts`
Expected: import fails.

- [ ] **Step 3: Implement**

Append to `src/shared/paths.ts`:
```ts
export function getDefaultSnapshotDir(): string {
  return path.join(getConfigDir(), 'snapshots');
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/shared/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/paths.ts test/shared/paths.test.ts
git commit -m "feat(snapshot): default snapshotDir under env-paths config"
```

---

## Task 5: `DirBlobStore` writer (TDD)

**Files:**
- Create: `src/core/blob-store.ts`
- Test: `test/core/blob-store.test.ts`

- [ ] **Step 1: Write failing test (write + sha + dedup)**

Create `test/core/blob-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { openDirBlobStoreWriter, openDirBlobStoreReader } from '../../src/core/blob-store.js';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-store-'));
});
afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeFixture(name: string, content: Buffer): Promise<string> {
  const p = path.join(tmpRoot, name);
  await fs.writeFile(p, content);
  return p;
}

describe('DirBlobStore writer', () => {
  it('streams a file into blobs/<sha256>.bin and returns a BlobRef', async () => {
    const writer = await openDirBlobStoreWriter(path.join(tmpRoot, 'snap'));
    const src = await writeFixture('hello.txt', Buffer.from('hello world'));
    const ref = await writer.putStream({ absPath: src, relPath: 'hello.txt' });
    await writer.close();

    const expectedSha = crypto.createHash('sha256').update('hello world').digest('hex');
    expect(ref.blob).toBe(expectedSha);
    expect(ref.size).toBe(11);
    expect(ref.path).toBe('hello.txt');

    const stored = await fs.readFile(path.join(tmpRoot, 'snap', 'blobs', `${expectedSha}.bin`));
    expect(stored.equals(Buffer.from('hello world'))).toBe(true);
  });

  it('dedupes identical content (second put does not duplicate)', async () => {
    const writer = await openDirBlobStoreWriter(path.join(tmpRoot, 'snap'));
    const a = await writeFixture('a.txt', Buffer.from('same'));
    const b = await writeFixture('b.txt', Buffer.from('same'));
    const refA = await writer.putStream({ absPath: a, relPath: 'a.txt' });
    const refB = await writer.putStream({ absPath: b, relPath: 'b.txt' });
    await writer.close();

    expect(refA.blob).toBe(refB.blob);
    const dirents = await fs.readdir(path.join(tmpRoot, 'snap', 'blobs'));
    expect(dirents).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/blob-store.test.ts`
Expected: import error.

- [ ] **Step 3: Create the module skeleton**

Create `src/core/blob-store.ts`:
```ts
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { BlobRef } from '../shared/types.js';

export type PutInput = { absPath: string; relPath: string };

export interface BlobStoreWriter {
  putStream(input: PutInput): Promise<BlobRef>;
  writeMetadata(name: string, json: string): Promise<void>;
  close(): Promise<void>;
}

export interface BlobStoreReader {
  readMetadata(name: string): Promise<string>;
  getStream(ref: BlobRef, destAbsPath: string): Promise<void>;
  close(): Promise<void>;
}

export async function openDirBlobStoreWriter(rootDir: string): Promise<BlobStoreWriter> {
  await fs.mkdir(path.join(rootDir, 'blobs'), { recursive: true });
  const seen = new Set<string>();

  return {
    async putStream({ absPath, relPath }) {
      const stat = await fs.stat(absPath);
      const tmp = path.join(rootDir, 'blobs', `.tmp-${crypto.randomBytes(8).toString('hex')}.bin`);
      const hash = crypto.createHash('sha256');
      const src = createReadStream(absPath);
      const dst = createWriteStream(tmp);
      let bytes = 0;
      src.on('data', (chunk: Buffer) => { hash.update(chunk); bytes += chunk.length; });
      await pipeline(src, dst);
      const sha = hash.digest('hex');
      const final = path.join(rootDir, 'blobs', `${sha}.bin`);
      if (seen.has(sha)) {
        await fs.unlink(tmp).catch(() => {});
      } else {
        try {
          await fs.rename(tmp, final);
        } catch {
          await fs.unlink(tmp).catch(() => {});
        }
        seen.add(sha);
      }
      const mode = (stat.mode & 0o777).toString(8).padStart(4, '0');
      return { path: relPath, blob: sha, size: bytes, mode };
    },

    async writeMetadata(name, json) {
      await fs.writeFile(path.join(rootDir, name), json);
    },

    async close() { /* nothing to flush */ },
  };
}

export async function openDirBlobStoreReader(rootDir: string): Promise<BlobStoreReader> {
  return {
    async readMetadata(name) {
      return fs.readFile(path.join(rootDir, name), 'utf8');
    },
    async getStream(ref, destAbsPath) {
      await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
      const tmp = `${destAbsPath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
      await pipeline(
        createReadStream(path.join(rootDir, 'blobs', `${ref.blob}.bin`)),
        createWriteStream(tmp),
      );
      await fs.rename(tmp, destAbsPath);
      if (ref.mode) {
        await fs.chmod(destAbsPath, parseInt(ref.mode, 8)).catch(() => {});
      }
    },
    async close() {},
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/core/blob-store.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/blob-store.ts test/core/blob-store.test.ts
git commit -m "feat(snapshot): DirBlobStore with streaming sha256 + dedup"
```

---

## Task 6: `DirBlobStore` reader roundtrip + mode preservation

**Files:**
- Modify: `test/core/blob-store.test.ts`

- [ ] **Step 1: Add failing roundtrip test**

Append to `test/core/blob-store.test.ts`:
```ts
describe('DirBlobStore reader', () => {
  it('round-trips a binary file byte-exact and restores exec bit', async () => {
    const writer = await openDirBlobStoreWriter(path.join(tmpRoot, 'snap'));
    const payload = crypto.randomBytes(1024 * 1024); // 1 MB
    const srcPath = path.join(tmpRoot, 'src.bin');
    await fs.writeFile(srcPath, payload);
    await fs.chmod(srcPath, 0o755);
    const ref = await writer.putStream({ absPath: srcPath, relPath: 'asset.bin' });
    await writer.writeMetadata('snapshot.json', JSON.stringify({ hello: 'world' }));
    await writer.close();

    const reader = await openDirBlobStoreReader(path.join(tmpRoot, 'snap'));
    expect(await reader.readMetadata('snapshot.json')).toBe('{"hello":"world"}');

    const destPath = path.join(tmpRoot, 'restored.bin');
    await reader.getStream(ref, destPath);
    const restored = await fs.readFile(destPath);
    expect(restored.equals(payload)).toBe(true);
    if (process.platform !== 'win32') {
      const st = await fs.stat(destPath);
      expect((st.mode & 0o777).toString(8)).toBe('755');
    }
  });
});
```

- [ ] **Step 2: Run test, expect PASS (already implemented)**

Run: `npx vitest run test/core/blob-store.test.ts -t "round-trips"`
Expected: PASS (Task 5 already implemented reader).

- [ ] **Step 3: Commit**

```bash
git add test/core/blob-store.test.ts
git commit -m "test(snapshot): DirBlobStore reader byte-exact roundtrip"
```

---

## Task 7: `ZipBlobStore` writer

**Files:**
- Modify: `src/core/blob-store.ts`
- Modify: `test/core/blob-store.test.ts`

- [ ] **Step 1: Add failing test for zip writer**

Append to `test/core/blob-store.test.ts`:
```ts
import { openZipBlobStoreWriter, openZipBlobStoreReader } from '../../src/core/blob-store.js';

describe('ZipBlobStore', () => {
  it('writes a zip with snapshot.json and blobs/, reads them back via random access', async () => {
    const archive = path.join(tmpRoot, 'snap.npmsnap');
    const writer = await openZipBlobStoreWriter(archive);
    const payload = Buffer.from('hello zip world');
    const srcPath = path.join(tmpRoot, 'in.txt');
    await fs.writeFile(srcPath, payload);
    const ref = await writer.putStream({ absPath: srcPath, relPath: 'in.txt' });
    await writer.writeMetadata('snapshot.json', JSON.stringify({ ref }));
    await writer.close();

    expect((await fs.stat(archive)).size).toBeGreaterThan(0);

    const reader = await openZipBlobStoreReader(archive);
    const meta = JSON.parse(await reader.readMetadata('snapshot.json'));
    expect(meta.ref.blob).toBe(ref.blob);

    const dest = path.join(tmpRoot, 'out.txt');
    await reader.getStream(ref, dest);
    expect((await fs.readFile(dest)).equals(payload)).toBe(true);
    await reader.close();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/blob-store.test.ts -t "ZipBlobStore"`
Expected: import error for `openZipBlobStoreWriter`.

- [ ] **Step 3: Implement zip writer**

Append to `src/core/blob-store.ts`:
```ts
import yazl from 'yazl';
import yauzl from 'yauzl';
import { Writable, Readable } from 'node:stream';

export async function openZipBlobStoreWriter(archivePath: string): Promise<BlobStoreWriter> {
  const tmpArchive = `${archivePath}.tmp.npmsnap`;
  const zip = new yazl.ZipFile();
  const out = createWriteStream(tmpArchive);
  zip.outputStream.pipe(out);
  const seen = new Set<string>();

  return {
    async putStream({ absPath, relPath }) {
      // First pass: stream to a tmp file on disk while hashing, so we know the sha
      // before adding to the zip (we need a stable entry name = sha256).
      const stagingDir = path.join(path.dirname(archivePath), '.npmsnap-staging');
      await fs.mkdir(stagingDir, { recursive: true });
      const staging = path.join(stagingDir, `${crypto.randomBytes(8).toString('hex')}.bin`);
      const hash = crypto.createHash('sha256');
      const src = createReadStream(absPath);
      const dst = createWriteStream(staging);
      let bytes = 0;
      src.on('data', (chunk: Buffer) => { hash.update(chunk); bytes += chunk.length; });
      await pipeline(src, dst);
      const sha = hash.digest('hex');
      const stat = await fs.stat(absPath);
      const mode = (stat.mode & 0o777).toString(8).padStart(4, '0');

      if (!seen.has(sha)) {
        zip.addFile(staging, `blobs/${sha}.bin`, { compress: false });
        seen.add(sha);
        // staging file is held open by yazl until close(); we cannot delete now.
      } else {
        await fs.unlink(staging).catch(() => {});
      }
      return { path: relPath, blob: sha, size: bytes, mode };
    },

    async writeMetadata(name, json) {
      zip.addBuffer(Buffer.from(json, 'utf8'), name, { compress: false });
    },

    async close() {
      zip.end();
      await new Promise<void>((res, rej) => {
        out.on('close', () => res());
        out.on('error', rej);
      });
      await fs.rename(tmpArchive, archivePath);
      const stagingDir = path.join(path.dirname(archivePath), '.npmsnap-staging');
      await fs.rm(stagingDir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 4: Run test, expect PASS for write only**

Run: `npx vitest run test/core/blob-store.test.ts -t "ZipBlobStore"`
Expected: FAIL — `openZipBlobStoreReader` not yet defined.

- [ ] **Step 5: Implement zip reader**

Append to `src/core/blob-store.ts`:
```ts
export async function openZipBlobStoreReader(archivePath: string): Promise<BlobStoreReader> {
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: false }, (err, zf) => {
      if (err || !zf) return reject(err);
      resolve(zf);
    });
  });

  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((resolve, reject) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      entries.set(entry.fileName, entry);
      zipfile.readEntry();
    });
    zipfile.on('end', resolve);
    zipfile.on('error', reject);
    zipfile.readEntry();
  });

  function openEntryStream(entry: yauzl.Entry): Promise<Readable> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err);
        resolve(stream);
      });
    });
  }

  return {
    async readMetadata(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`Entry not found in archive: ${name}`);
      const stream = await openEntryStream(entry);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    },
    async getStream(ref, destAbsPath) {
      const entry = entries.get(`blobs/${ref.blob}.bin`);
      if (!entry) throw new Error(`Blob ${ref.blob} not in archive`);
      const stream = await openEntryStream(entry);
      await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
      const tmp = `${destAbsPath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
      await pipeline(stream, createWriteStream(tmp));
      await fs.rename(tmp, destAbsPath);
      if (ref.mode) {
        await fs.chmod(destAbsPath, parseInt(ref.mode, 8)).catch(() => {});
      }
    },
    async close() {
      zipfile.close();
    },
  };
}
```

- [ ] **Step 6: Run test, expect PASS**

Run: `npx vitest run test/core/blob-store.test.ts -t "ZipBlobStore"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/blob-store.ts test/core/blob-store.test.ts
git commit -m "feat(snapshot): ZipBlobStore with yazl write + yauzl random-access read"
```

---

## Task 8: `ZipBlobStore` 10 MB random binary roundtrip

**Files:**
- Modify: `test/core/blob-store.test.ts`

- [ ] **Step 1: Add the streaming-size test**

Append to `test/core/blob-store.test.ts`, inside the `describe('ZipBlobStore', …)` block:
```ts
it('round-trips a 10 MB random binary byte-exact via streaming', async () => {
  const archive = path.join(tmpRoot, 'big.npmsnap');
  const writer = await openZipBlobStoreWriter(archive);
  const payload = crypto.randomBytes(10 * 1024 * 1024);
  const srcPath = path.join(tmpRoot, 'big.bin');
  await fs.writeFile(srcPath, payload);
  const ref = await writer.putStream({ absPath: srcPath, relPath: 'big.bin' });
  await writer.writeMetadata('snapshot.json', JSON.stringify({ ref }));
  await writer.close();

  const reader = await openZipBlobStoreReader(archive);
  const dest = path.join(tmpRoot, 'big-restored.bin');
  await reader.getStream(ref, dest);
  const restored = await fs.readFile(dest);
  expect(restored.equals(payload)).toBe(true);
  await reader.close();
}, 30000);
```

- [ ] **Step 2: Run test, expect PASS**

Run: `npx vitest run test/core/blob-store.test.ts -t "10 MB"`
Expected: PASS (within ~30s).

- [ ] **Step 3: Commit**

```bash
git add test/core/blob-store.test.ts
git commit -m "test(snapshot): 10 MB roundtrip via streaming"
```

---

## Task 9: Extend `GitOps` — read-side primitives

**Files:**
- Modify: `src/core/git.ts`
- Test: `test/core/git-snapshot.test.ts`

- [ ] **Step 1: Write failing test against a fixture repo**

Create `test/core/git-snapshot.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { GitOps } from '../../src/core/git.js';

let repo: string;
let git: GitOps;
beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'git-snap-'));
  const sg = simpleGit(repo);
  await sg.init();
  await sg.addConfig('user.email', 'test@example.com');
  await sg.addConfig('user.name', 'Test');
  await fs.writeFile(path.join(repo, 'a.txt'), 'hello\n');
  await sg.add('a.txt');
  await sg.commit('init');
  git = new GitOps();
});

describe('GitOps snapshot extensions', () => {
  it('headSha returns 40-char SHA', async () => {
    const sha = await git.headSha(repo);
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('currentBranch returns the current branch name', async () => {
    const branch = await git.currentBranch(repo);
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  it('diffHead returns empty string for clean tree', async () => {
    expect(await git.diffHead(repo)).toBe('');
  });

  it('diffHead returns a unified diff for modified tracked files', async () => {
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nworld\n');
    const d = await git.diffHead(repo);
    expect(d).toContain('+world');
  });

  it('listUntracked excludes gitignored', async () => {
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\nnode_modules/\n');
    await fs.writeFile(path.join(repo, 'untracked.txt'), 'x');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'y');
    const list = await git.listUntracked(repo);
    expect(list).toContain('untracked.txt');
    expect(list).toContain('.gitignore');
    expect(list).not.toContain('ignored.txt');
  });

  it('listIgnored returns ignored files but excludes node_modules paths', async () => {
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\nnode_modules/\n');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'y');
    await fs.mkdir(path.join(repo, 'node_modules'));
    await fs.writeFile(path.join(repo, 'node_modules', 'pkg.txt'), 'z');
    const list = await git.listIgnored(repo, ['node_modules']);
    expect(list).toContain('ignored.txt');
    expect(list.some((p) => p.startsWith('node_modules/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/git-snapshot.test.ts`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement the new methods**

In `src/core/git.ts`, inside `class GitOps`, append:
```ts
async headSha(repo: string): Promise<string> {
  try {
    return (await simpleGit(repo).revparse(['HEAD'])).trim();
  } catch (err) {
    throw new GitError(`headSha failed in ${repo}`, 'E_GIT_HEAD_SHA', err as Error);
  }
}

async currentBranch(repo: string): Promise<string> {
  try {
    const s = await simpleGit(repo).status();
    if (s.current) return s.current;
    // Detached HEAD: fall back to short SHA
    const sha = await this.headSha(repo);
    return sha.slice(0, 7);
  } catch (err) {
    throw new GitError(`currentBranch failed in ${repo}`, 'E_GIT_BRANCH', err as Error);
  }
}

async diffHead(repo: string): Promise<string> {
  try {
    const r = await execa('git', ['diff', 'HEAD'], { cwd: repo });
    return r.stdout;
  } catch (err) {
    throw new GitError(`diffHead failed in ${repo}`, 'E_GIT_DIFF', err as Error);
  }
}

async listUntracked(repo: string): Promise<string[]> {
  const r = await execa('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repo });
  return r.stdout.split('\n').filter(Boolean);
}

async listIgnored(repo: string, excludePrefixes: string[] = []): Promise<string[]> {
  const r = await execa(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard'],
    { cwd: repo },
  );
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .filter((p) => !excludePrefixes.some((pref) => p === pref || p.startsWith(`${pref}/`)));
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run test/core/git-snapshot.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/git.ts test/core/git-snapshot.test.ts
git commit -m "feat(snapshot): GitOps headSha/currentBranch/diffHead/listUntracked/listIgnored"
```

---

## Task 10: Extend `GitOps` — stash capture

**Files:**
- Modify: `src/core/git.ts`
- Modify: `test/core/git-snapshot.test.ts`

- [ ] **Step 1: Append failing test**

Append to `test/core/git-snapshot.test.ts`:
```ts
it('listStashes returns metadata for each stash and stashPatch returns a unified diff', async () => {
  const sg = simpleGit(repo);
  await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nstash-me\n');
  await sg.stash(['push', '-m', 'first']);
  await fs.writeFile(path.join(repo, 'b.txt'), 'second');
  await sg.stash(['push', '--include-untracked', '-m', 'second']);

  const stashes = await git.listStashes(repo);
  expect(stashes).toHaveLength(2);
  expect(stashes[0].message).toContain('second');

  const patch = await git.stashPatch(repo, 0);
  expect(patch).toContain('diff');
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/git-snapshot.test.ts -t "listStashes"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `class GitOps` in `src/core/git.ts`:
```ts
async listStashes(repo: string): Promise<{ idx: number; message: string; includesUntracked: boolean }[]> {
  const r = await execa('git', ['stash', 'list', '--format=%gd|%s'], { cwd: repo });
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const [ref, ...rest] = line.split('|');
    const message = rest.join('|');
    const m = /stash@\{(\d+)\}/.exec(ref);
    const idx = m ? Number(m[1]) : -1;
    return { idx, message, includesUntracked: /WIP on|--include-untracked|untracked/i.test(message) };
  });
}

async stashPatch(repo: string, idx: number): Promise<string> {
  const r = await execa('git', ['stash', 'show', '-p', '--include-untracked', `stash@{${idx}}`], { cwd: repo });
  return r.stdout;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/core/git-snapshot.test.ts -t "listStashes"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/git.ts test/core/git-snapshot.test.ts
git commit -m "feat(snapshot): GitOps listStashes + stashPatch"
```

---

## Task 11: Extend `GitOps` — restore-side primitives

**Files:**
- Modify: `src/core/git.ts`
- Modify: `test/core/git-snapshot.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `test/core/git-snapshot.test.ts`:
```ts
it('resetHard moves HEAD to a given SHA', async () => {
  const sg = simpleGit(repo);
  const sha = await git.headSha(repo);
  await fs.writeFile(path.join(repo, 'a.txt'), 'changed\n');
  await sg.add('a.txt');
  await sg.commit('change');
  await git.resetHard(repo, sha);
  expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\n');
});

it('applyDiff applies a unified patch to a clean tree', async () => {
  await fs.writeFile(path.join(repo, 'a.txt'), 'hello\nadded\n');
  const patch = await git.diffHead(repo);
  await simpleGit(repo).checkout(['--', 'a.txt']); // revert
  expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\n');
  await git.applyDiff(repo, patch);
  expect((await fs.readFile(path.join(repo, 'a.txt'), 'utf8'))).toBe('hello\nadded\n');
});

it('checkoutBranch creates a local branch if it does not exist', async () => {
  await git.checkoutBranch(repo, 'feature/new');
  expect(await git.currentBranch(repo)).toBe('feature/new');
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run test/core/git-snapshot.test.ts -t "resetHard|applyDiff|checkoutBranch"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `class GitOps` in `src/core/git.ts`:
```ts
async resetHard(repo: string, sha: string): Promise<void> {
  try {
    await simpleGit(repo).reset(['--hard', sha]);
  } catch (err) {
    throw new GitError(`resetHard ${sha} failed in ${repo}`, 'E_GIT_RESET', err as Error);
  }
}

async applyDiff(repo: string, patch: string): Promise<void> {
  if (!patch) return;
  await execa('git', ['apply', '--3way', '--whitespace=nowarn', '-'], { cwd: repo, input: patch });
}

async checkoutBranch(repo: string, branch: string): Promise<void> {
  try {
    await simpleGit(repo).checkout(branch);
  } catch {
    await simpleGit(repo).checkoutLocalBranch(branch);
  }
}

async applyStashPatch(repo: string, patch: string): Promise<void> {
  if (!patch) return;
  await execa('git', ['apply', '--3way', '--whitespace=nowarn', '-'], { cwd: repo, input: patch });
}

async lsRemoteHas(repo: string, branch: string): Promise<boolean> {
  try {
    const r = await execa('git', ['ls-remote', '--heads', 'origin', branch], { cwd: repo });
    return r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run test/core/git-snapshot.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/git.ts test/core/git-snapshot.test.ts
git commit -m "feat(snapshot): GitOps resetHard/applyDiff/applyStashPatch/checkoutBranch/lsRemoteHas"
```

---

## Task 12: `SnapshotEngine.create` — happy path with mocked dependencies

**Files:**
- Create: `src/core/snapshot.ts`
- Test: `test/core/snapshot.test.ts`

- [ ] **Step 1: Write the failing engine test**

Create `test/core/snapshot.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { SnapshotEngine, type SnapshotEvent } from '../../src/core/snapshot.js';
import type { Project, BlobRef } from '../../src/shared/types.js';

function makeProject(name: string): Project {
  return { name, group: 'g', url: `https://x/${name}.git` };
}

const gitMock = {
  headSha: vi.fn(async () => 'a'.repeat(40)),
  currentBranch: vi.fn(async () => 'main'),
  diffHead: vi.fn(async () => ''),
  listUntracked: vi.fn(async () => [] as string[]),
  listIgnored: vi.fn(async () => [] as string[]),
  listStashes: vi.fn(async () => [] as { idx: number; message: string; includesUntracked: boolean }[]),
  stashPatch: vi.fn(async () => ''),
};

const writerMock = {
  putStream: vi.fn(async ({ relPath }): Promise<BlobRef> => ({
    path: relPath, blob: 'b'.repeat(64), size: 0,
  })),
  writeMetadata: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
};

describe('SnapshotEngine.create', () => {
  it('emits project-start, phases in order, then project-done, then done', async () => {
    const engine = new SnapshotEngine({
      git: gitMock as never,
      openWriter: async () => writerMock,
      resolveProjectPath: (_root, p) => `/root/${p.group}/${p.name}`,
    });

    const events: SnapshotEvent[] = [];
    for await (const ev of engine.create({
      projects: [makeProject('a')],
      rootDir: '/root',
      snapshotPath: '/snaps/x.npmsnap',
    })) {
      events.push(ev);
    }

    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('project-start');
    expect(kinds).toContain('project-done');
    expect(kinds[kinds.length - 1]).toBe('done');
    const phases = events.filter((e) => e.kind === 'phase').map((e) => (e as Extract<SnapshotEvent, { kind: 'phase' }>).phase);
    expect(phases).toEqual(['diff', 'untracked', 'gitignored', 'stash', 'finalizing']);
    expect(writerMock.writeMetadata).toHaveBeenCalledWith('snapshot.json', expect.any(String));
    expect(writerMock.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create engine**

Create `src/core/snapshot.ts`:
```ts
import path from 'node:path';
import type { Project, Snapshot, ProjectSnapshot, BlobRef } from '../shared/types.js';
import type { GitOps } from './git.js';
import type { BlobStoreWriter, BlobStoreReader } from './blob-store.js';

export type SnapshotPhase =
  | 'diff' | 'untracked' | 'gitignored' | 'stash' | 'finalizing'
  | 'clone' | 'checkout' | 'reset' | 'apply-diff' | 'write-files' | 'apply-stash';

export type SnapshotEvent =
  | { kind: 'project-start'; project: Project }
  | { kind: 'phase'; project: Project; phase: SnapshotPhase }
  | { kind: 'file-progress'; project: Project; current: number; total: number; path: string }
  | { kind: 'log'; level: 'info' | 'warn'; project?: Project; message: string }
  | { kind: 'project-done'; project: Project; bytes: number; warnings: number }
  | { kind: 'project-error'; project: Project; error: string }
  | { kind: 'done'; snapshot: Snapshot; path: string };

export type RestoreConflictDecision = 'skip' | 'overwrite' | 'abort';

export type CreateInput = {
  projects: Project[];
  rootDir: string;
  snapshotPath: string;
  label?: string;
};

export type RestoreInput = {
  snapshot: Snapshot;
  rootDir: string;
  onConflict: (project: Project) => Promise<RestoreConflictDecision>;
};

export type SnapshotDeps = {
  git: Pick<GitOps,
    'headSha' | 'currentBranch' | 'diffHead' | 'listUntracked' | 'listIgnored' | 'listStashes' | 'stashPatch'
  > & Partial<Pick<GitOps, 'clone' | 'resetHard' | 'applyDiff' | 'applyStashPatch' | 'checkoutBranch' | 'lsRemoteHas'>>;
  openWriter: (snapshotPath: string) => Promise<BlobStoreWriter>;
  openReader?: (snapshotPath: string) => Promise<BlobStoreReader>;
  resolveProjectPath: (rootDir: string, p: Project) => string;
};

export class SnapshotEngine {
  constructor(private deps: SnapshotDeps) {}

  async *create(input: CreateInput): AsyncGenerator<SnapshotEvent, void, void> {
    const writer = await this.deps.openWriter(input.snapshotPath);
    const collected: ProjectSnapshot[] = [];

    for (const project of input.projects) {
      yield { kind: 'project-start', project };
      const repo = this.deps.resolveProjectPath(input.rootDir, project);
      const warnings: string[] = [];
      let bytes = 0;

      try {
        yield { kind: 'phase', project, phase: 'diff' };
        const [head, branch, trackedDiff] = await Promise.all([
          this.deps.git.headSha(repo),
          this.deps.git.currentBranch(repo),
          this.deps.git.diffHead(repo),
        ]);
        yield { kind: 'log', level: 'info', project, message: `diff HEAD (${trackedDiff.length} bytes)` };

        yield { kind: 'phase', project, phase: 'untracked' };
        const untrackedList = await this.deps.git.listUntracked(repo);
        const untrackedRefs: BlobRef[] = [];
        for (const rel of untrackedList) {
          try {
            untrackedRefs.push(await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }));
          } catch (err) {
            warnings.push(`skip ${rel}: ${(err as Error).message}`);
          }
        }

        yield { kind: 'phase', project, phase: 'gitignored' };
        const ignoredList = await this.deps.git.listIgnored(repo, ['node_modules']);
        const ignoredRefs: BlobRef[] = [];
        for (const rel of ignoredList) {
          try {
            ignoredRefs.push(await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }));
          } catch (err) {
            warnings.push(`skip ${rel}: ${(err as Error).message}`);
          }
        }

        yield { kind: 'phase', project, phase: 'stash' };
        const stashMeta = await this.deps.git.listStashes(repo);
        const stashes: ProjectSnapshot['stashes'] = [];
        for (const s of stashMeta) {
          const patch = await this.deps.git.stashPatch(repo, s.idx);
          stashes.push({ message: s.message, patch, includesUntracked: s.includesUntracked });
        }

        const entry: ProjectSnapshot = {
          name: project.name, group: project.group, url: project.url,
          branch, head, trackedDiff,
          untrackedFiles: untrackedRefs, gitignoredFiles: ignoredRefs, stashes,
          warnings: warnings.length ? warnings : undefined,
        };
        bytes = JSON.stringify(entry).length;
        collected.push(entry);
        yield { kind: 'project-done', project, bytes, warnings: warnings.length };
      } catch (err) {
        yield { kind: 'project-error', project, error: (err as Error).message };
      }
    }

    if (input.projects[0]) yield { kind: 'phase', project: input.projects[0], phase: 'finalizing' };
    const snapshot: Snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      label: input.label,
      projects: collected,
    };
    await writer.writeMetadata('snapshot.json', JSON.stringify(snapshot, null, 2));
    await writer.close();
    yield { kind: 'done', snapshot, path: input.snapshotPath };
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/core/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/snapshot.ts test/core/snapshot.test.ts
git commit -m "feat(snapshot): SnapshotEngine.create happy path"
```

---

## Task 13: `SnapshotEngine.create` — emit `file-progress` per file

**Files:**
- Modify: `src/core/snapshot.ts`
- Modify: `test/core/snapshot.test.ts`

- [ ] **Step 1: Append failing test**

Append to `test/core/snapshot.test.ts`:
```ts
it('emits one file-progress event per untracked file', async () => {
  gitMock.listUntracked.mockResolvedValueOnce(['a.txt', 'b.txt']);
  const engine = new SnapshotEngine({
    git: gitMock as never,
    openWriter: async () => writerMock,
    resolveProjectPath: () => '/repo',
  });
  const events: SnapshotEvent[] = [];
  for await (const ev of engine.create({
    projects: [makeProject('p')], rootDir: '/r', snapshotPath: '/s/x.npmsnap',
  })) events.push(ev);
  const fileEvents = events.filter((e) => e.kind === 'file-progress');
  expect(fileEvents).toHaveLength(2);
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/snapshot.test.ts -t "file-progress"`
Expected: FAIL — current helper does not emit.

- [ ] **Step 3: Emit `file-progress` and warn logs in the existing inline loops**

In `src/core/snapshot.ts`, replace the existing `untracked` and `gitignored` blocks (the two `for (const rel of ...)` loops from Task 12) with index-aware loops that emit per-file events:

```ts
yield { kind: 'phase', project, phase: 'untracked' };
const untrackedList = await this.deps.git.listUntracked(repo);
const untrackedRefs: BlobRef[] = [];
for (let i = 0; i < untrackedList.length; i++) {
  const rel = untrackedList[i];
  yield { kind: 'file-progress', project, current: i + 1, total: untrackedList.length, path: rel };
  try {
    untrackedRefs.push(await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }));
  } catch (err) {
    const msg = `skip ${rel}: ${(err as Error).message}`;
    warnings.push(msg);
    yield { kind: 'log', level: 'warn', project, message: msg };
  }
}

yield { kind: 'phase', project, phase: 'gitignored' };
const ignoredList = await this.deps.git.listIgnored(repo, ['node_modules']);
const ignoredRefs: BlobRef[] = [];
for (let i = 0; i < ignoredList.length; i++) {
  const rel = ignoredList[i];
  yield { kind: 'file-progress', project, current: i + 1, total: ignoredList.length, path: rel };
  try {
    ignoredRefs.push(await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }));
  } catch (err) {
    const msg = `skip ${rel}: ${(err as Error).message}`;
    warnings.push(msg);
    yield { kind: 'log', level: 'warn', project, message: msg };
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run test/core/snapshot.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/snapshot.ts test/core/snapshot.test.ts
git commit -m "feat(snapshot): per-file file-progress events in create"
```

---

## Task 14: `SnapshotEngine.restore` — happy path

**Files:**
- Modify: `src/core/snapshot.ts`
- Modify: `test/core/snapshot.test.ts`

- [ ] **Step 1: Append failing restore test**

Append to `test/core/snapshot.test.ts`:
```ts
describe('SnapshotEngine.restore', () => {
  it('clones, resets, applies diff, writes blobs, applies stashes for each project', async () => {
    const readerMock = {
      readMetadata: vi.fn(async () => ''),
      getStream: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const cloneCalls: string[] = [];
    const gitR = {
      ...gitMock,
      clone: vi.fn(async function* (url: string, dest: string) {
        cloneCalls.push(`${url}->${dest}`);
        yield { phase: 'cloning', percent: 100, message: 'done' };
      }),
      checkoutBranch: vi.fn(async () => {}),
      resetHard: vi.fn(async () => {}),
      applyDiff: vi.fn(async () => {}),
      applyStashPatch: vi.fn(async () => {}),
      lsRemoteHas: vi.fn(async () => true),
    };

    const engine = new SnapshotEngine({
      git: gitR as never,
      openWriter: async () => writerMock,
      openReader: async () => readerMock as never,
      resolveProjectPath: (_r, p) => `/dest/${p.group}/${p.name}`,
    });

    const snapshot = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      projects: [{
        name: 'a', group: 'g', url: 'https://x/a.git',
        branch: 'main', head: 'a'.repeat(40),
        trackedDiff: '', untrackedFiles: [], gitignoredFiles: [], stashes: [],
      }],
    };
    const events: SnapshotEvent[] = [];
    for await (const ev of engine.restore({
      snapshot, snapshotPath: '/tmp/x.npmsnap', rootDir: '/dest', onConflict: async () => 'overwrite',
    })) events.push(ev);

    expect(cloneCalls).toEqual(['https://x/a.git->/dest/g/a']);
    expect(gitR.resetHard).toHaveBeenCalledWith('/dest/g/a', 'a'.repeat(40));
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('project-start');
    expect(kinds[kinds.length - 1]).toBe('done');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/snapshot.test.ts -t "SnapshotEngine.restore"`
Expected: FAIL — method not implemented.

- [ ] **Step 3: Extend `RestoreInput` with `snapshotPath`**

Modify `RestoreInput` in `src/core/snapshot.ts`:
```ts
export type RestoreInput = {
  snapshot: Snapshot;
  snapshotPath: string;
  rootDir: string;
  onConflict: (project: Project) => Promise<RestoreConflictDecision>;
};
```

Update the failing test from Step 1 to pass `snapshotPath: '/tmp/x.npmsnap'` in its `engine.restore({...})` call (the value is never inspected — the mocked `openReader` ignores its argument and returns `readerMock`).

- [ ] **Step 4: Implement `restore`**

In `src/core/snapshot.ts`, add to `class SnapshotEngine`:
```ts
async *restore(input: RestoreInput): AsyncGenerator<SnapshotEvent, void, void> {
  if (!this.deps.openReader) {
    throw new Error('SnapshotEngine.restore requires deps.openReader');
  }
  const git = this.deps.git as Required<SnapshotDeps['git']>;
  const reader = await this.deps.openReader(input.snapshotPath);

  try {
    for (const project of input.snapshot.projects) {
      yield { kind: 'project-start', project };
      const dest = this.deps.resolveProjectPath(input.rootDir, project);

      try {
        // Conflict handling is added in Task 15.

        yield { kind: 'phase', project, phase: 'clone' };
        for await (const ev of git.clone(project.url, dest)) {
          if (ev.message) yield { kind: 'log', level: 'info', project, message: ev.message };
        }

        yield { kind: 'phase', project, phase: 'checkout' };
        const remote = await git.lsRemoteHas(dest, project.branch);
        if (!remote) yield { kind: 'log', level: 'warn', project, message: `branch ${project.branch} not in remote — creating local-only` };
        await git.checkoutBranch(dest, project.branch);

        yield { kind: 'phase', project, phase: 'reset' };
        await git.resetHard(dest, project.head);

        yield { kind: 'phase', project, phase: 'apply-diff' };
        if (project.trackedDiff) {
          try { await git.applyDiff(dest, project.trackedDiff); }
          catch (err) { yield { kind: 'log', level: 'warn', project, message: `apply-diff conflicts: ${(err as Error).message}` }; }
        }

        yield { kind: 'phase', project, phase: 'write-files' };
        const blobs = [...project.untrackedFiles, ...project.gitignoredFiles];
        for (let i = 0; i < blobs.length; i++) {
          const ref = blobs[i];
          yield { kind: 'file-progress', project, current: i + 1, total: blobs.length, path: ref.path };
          try {
            await reader.getStream(ref, path.join(dest, ref.path));
          } catch (err) {
            yield { kind: 'log', level: 'warn', project, message: `skip ${ref.path}: ${(err as Error).message}` };
          }
        }

        yield { kind: 'phase', project, phase: 'apply-stash' };
        for (let i = project.stashes.length - 1; i >= 0; i--) {
          const s = project.stashes[i];
          try { await git.applyStashPatch(dest, s.patch); }
          catch (err) { yield { kind: 'log', level: 'warn', project, message: `stash apply failed: ${(err as Error).message}` }; }
        }

        yield { kind: 'project-done', project, bytes: 0, warnings: 0 };
      } catch (err) {
        yield { kind: 'project-error', project, error: (err as Error).message };
      }
    }
  } finally {
    await reader.close();
  }

  yield { kind: 'done', snapshot: input.snapshot, path: input.snapshotPath };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/core/snapshot.test.ts -t "SnapshotEngine.restore"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/snapshot.ts test/core/snapshot.test.ts
git commit -m "feat(snapshot): SnapshotEngine.restore happy path"
```

---

## Task 15: `SnapshotEngine.restore` — conflict prompts

**Files:**
- Modify: `src/core/snapshot.ts`
- Modify: `test/core/snapshot.test.ts`

- [ ] **Step 1: Append failing test**

Append to `test/core/snapshot.test.ts`:
```ts
it('calls onConflict when dest already exists and honours skip/overwrite/abort', async () => {
  const existsCheck = vi.fn(async () => true); // every dest "exists"
  const removeDir = vi.fn(async () => {});
  const decisions: ('skip' | 'overwrite' | 'abort')[] = ['skip', 'overwrite'];
  const onConflict = vi.fn(async () => decisions.shift()!);
  const engine = new SnapshotEngine({
    git: { ...gitMock, clone: async function* () { yield { phase: 'cloning' }; }, checkoutBranch: async () => {}, resetHard: async () => {}, applyDiff: async () => {}, applyStashPatch: async () => {}, lsRemoteHas: async () => true } as never,
    openWriter: async () => writerMock,
    openReader: async () => ({ readMetadata: async () => '', getStream: async () => {}, close: async () => {} }) as never,
    resolveProjectPath: (_r, p) => `/dest/${p.name}`,
    destExists: existsCheck,
    removeDest: removeDir,
  });
  const snapshot = {
    version: 1 as const, createdAt: new Date().toISOString(),
    projects: [
      { name: 'a', group: 'g', url: 'u', branch: 'main', head: 'a'.repeat(40), trackedDiff: '', untrackedFiles: [], gitignoredFiles: [], stashes: [] },
      { name: 'b', group: 'g', url: 'u', branch: 'main', head: 'a'.repeat(40), trackedDiff: '', untrackedFiles: [], gitignoredFiles: [], stashes: [] },
    ],
  };
  const evts: SnapshotEvent[] = [];
  for await (const ev of engine.restore({ snapshot, snapshotPath: '/tmp/x.npmsnap', rootDir: '/dest', onConflict })) evts.push(ev);
  expect(onConflict).toHaveBeenCalledTimes(2);
  expect(removeDir).toHaveBeenCalledTimes(1); // only the overwrite case
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/snapshot.test.ts -t "onConflict"`
Expected: FAIL — `destExists`/`removeDest` not in deps.

- [ ] **Step 3: Extend deps + wire conflict logic**

Modify `SnapshotDeps` in `src/core/snapshot.ts`:
```ts
export type SnapshotDeps = {
  // ...existing fields...
  destExists?: (absPath: string) => Promise<boolean>;
  removeDest?: (absPath: string) => Promise<void>;
};
```

At the top of the per-project loop in `restore`, before the `clone` phase, insert:
```ts
const exists = this.deps.destExists ? await this.deps.destExists(dest) : false;
if (exists) {
  const decision = await input.onConflict(project);
  if (decision === 'abort') throw new SnapshotError('user aborted restore', 'E_SNAP_CONFLICT_ABORT');
  if (decision === 'skip') {
    yield { kind: 'project-done', project, bytes: 0, warnings: 0 };
    continue;
  }
  if (decision === 'overwrite' && this.deps.removeDest) {
    await this.deps.removeDest(dest);
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run test/core/snapshot.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/snapshot.ts test/core/snapshot.test.ts
git commit -m "feat(snapshot): restore conflict prompt (skip/overwrite/abort)"
```

---

## Task 16: `snapshot-scanner` — find `*.npmsnap` files

**Files:**
- Create: `src/core/snapshot-scanner.ts`
- Test: `test/core/snapshot-scanner.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/core/snapshot-scanner.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanForSnapshots } from '../../src/core/snapshot-scanner.js';

let tmp: string;
beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-')); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('scanForSnapshots', () => {
  it('finds *.npmsnap files and skips node_modules and .git', async () => {
    await fs.mkdir(path.join(tmp, 'a', 'b'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'node_modules'));
    await fs.mkdir(path.join(tmp, '.git'));
    await fs.writeFile(path.join(tmp, 'one.npmsnap'), '');
    await fs.writeFile(path.join(tmp, 'a', 'two.npmsnap'), '');
    await fs.writeFile(path.join(tmp, 'a', 'b', 'three.npmsnap'), '');
    await fs.writeFile(path.join(tmp, 'node_modules', 'ignore.npmsnap'), '');
    await fs.writeFile(path.join(tmp, '.git', 'ignore.npmsnap'), '');
    await fs.writeFile(path.join(tmp, 'tmp.tmp.npmsnap'), ''); // partial

    const found = await scanForSnapshots(tmp);
    const rels = found.map((p) => path.relative(tmp, p)).sort();
    expect(rels).toEqual(['a/b/three.npmsnap', 'a/two.npmsnap', 'one.npmsnap'].sort());
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/core/snapshot-scanner.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/core/snapshot-scanner.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git']);

export async function scanForSnapshots(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith('.npmsnap') && !e.name.endsWith('.tmp.npmsnap')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/core/snapshot-scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/snapshot-scanner.ts test/core/snapshot-scanner.test.ts
git commit -m "feat(snapshot): filesystem scanner for *.npmsnap"
```

---

## Task 17: CLI `pm snapshot create`

**Files:**
- Create: `src/cli/commands/snapshot.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Scaffold the command**

Create `src/cli/commands/snapshot.ts`:
```ts
import type { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ManifestStore } from '../../core/manifest.js';
import { GitOps } from '../../core/git.js';
import { SnapshotEngine } from '../../core/snapshot.js';
import { openZipBlobStoreWriter, openDirBlobStoreWriter, openZipBlobStoreReader, openDirBlobStoreReader } from '../../core/blob-store.js';
import { scanForSnapshots } from '../../core/snapshot-scanner.js';
import { getDefaultSnapshotDir, expandHome } from '../../shared/paths.js';
import { SnapshotSchema } from '../../shared/types.js';
import type { Project } from '../../shared/types.js';
import os from 'node:os';

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function pickProjects(store: ManifestStore, names: string[], opts: { all?: boolean; group?: string }): Promise<Project[]> {
  const all = await store.list({ group: opts.group });
  if (opts.all) return all;
  if (names.length === 0) throw new Error('Specify project names or --all');
  return all.filter((p) => names.includes(p.name));
}

export function registerSnapshot(program: Command): void {
  const cmd = program.command('snapshot').description('Capture/restore project working state');

  cmd.command('create [names...]')
    .description('Snapshot the working state of selected projects into a .npmsnap zip')
    .option('--all', 'snapshot every project in the manifest')
    .option('--group <g>', 'snapshot only projects in a group')
    .option('--out <path>', 'explicit output path')
    .option('--label <s>', 'optional label suffix')
    .option('--no-zip', 'write a loose directory instead of the .npmsnap zip')
    .action(async (names: string[], opts: { all?: boolean; group?: string; out?: string; label?: string; zip?: boolean }) => {
      const store = new ManifestStore();
      const manifest = await store.load();
      const projects = await pickProjects(store, names, opts);
      if (projects.length === 0) { console.log('No projects selected.'); return; }

      const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
      await fs.mkdir(dir, { recursive: true });
      const stamp = ts();
      const label = opts.label ? `-${opts.label}` : '';
      const defaultName = opts.zip === false ? `${stamp}${label}` : `${stamp}${label}.npmsnap`;
      const out = opts.out ?? path.join(dir, defaultName);

      const engine = new SnapshotEngine({
        git: new GitOps(),
        openWriter: (p) => opts.zip === false ? openDirBlobStoreWriter(p) : openZipBlobStoreWriter(p),
        openReader: (p) => p.endsWith('.npmsnap') ? openZipBlobStoreReader(p) : openDirBlobStoreReader(p),
        resolveProjectPath: (_root, proj) => path.join(expandHome(manifest.root), proj.group, proj.name),
        destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
        removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
      });

      for await (const ev of engine.create({ projects, rootDir: manifest.root, snapshotPath: out, label: opts.label })) {
        if (ev.kind === 'log') console.log(`[${ev.level}] ${ev.message}`);
        else if (ev.kind === 'phase') console.log(`-- ${ev.project.group}/${ev.project.name}: ${ev.phase}`);
        else if (ev.kind === 'project-error') console.log(`!! ${ev.project.group}/${ev.project.name}: ${ev.error}`);
        else if (ev.kind === 'done') console.log(`OK  snapshot written to ${ev.path}`);
      }
    });
}
```

- [ ] **Step 2: Wire it into the CLI root**

Modify `src/cli/index.ts`. Find the existing `registerImport(...)` / `registerExport(...)` registration list and append:
```ts
import { registerSnapshot } from './commands/snapshot.js';
// ...
registerSnapshot(program);
```

- [ ] **Step 3: Typecheck + manual smoke**

Run: `npm run typecheck`
Expected: no errors.

Then build + run help:
```bash
npm run build
node dist/index.js snapshot --help
```
Expected: lists `create`, plus options including `--no-zip`, `--all`, `--label`, `--out`, `--group`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/snapshot.ts src/cli/index.ts
git commit -m "feat(snapshot): pm snapshot create CLI command"
```

---

## Task 18: CLI `pm snapshot restore`

**Files:**
- Modify: `src/cli/commands/snapshot.ts`

- [ ] **Step 1: Implement the subcommand**

Append inside `registerSnapshot` (after the `create` subcommand) in `src/cli/commands/snapshot.ts`:
```ts
cmd.command('restore <path>')
  .description('Restore a snapshot from a .npmsnap archive or a snapshot directory')
  .option('--only <name>', 'restore only one project from the snapshot')
  .option('--on-conflict <mode>', 'skip|overwrite|abort (default: prompt)')
  .action(async (snapshotPath: string, opts: { only?: string; onConflict?: 'skip' | 'overwrite' | 'abort' }) => {
    const store = new ManifestStore();
    const manifest = await store.load();
    const reader = snapshotPath.endsWith('.npmsnap')
      ? await openZipBlobStoreReader(snapshotPath)
      : await openDirBlobStoreReader(snapshotPath);
    const raw = await reader.readMetadata('snapshot.json');
    const snapshot = SnapshotSchema.parse(JSON.parse(raw));
    if (opts.only) snapshot.projects = snapshot.projects.filter((p) => p.name === opts.only);

    const engine = new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) => openZipBlobStoreWriter(p),  // unused on restore path
      openReader: () => Promise.resolve(reader),
      resolveProjectPath: (root, proj) => path.join(expandHome(root), proj.group, proj.name),
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });

    const promptDecision = async (): Promise<'skip' | 'overwrite' | 'abort'> => {
      if (opts.onConflict) return opts.onConflict;
      // simple stdin prompt
      process.stdout.write('Dest exists. [s]kip / [o]verwrite / [a]bort? ');
      const input = await new Promise<string>((res) => process.stdin.once('data', (b) => res(b.toString().trim().toLowerCase())));
      return input.startsWith('o') ? 'overwrite' : input.startsWith('a') ? 'abort' : 'skip';
    };

    for await (const ev of engine.restore({ snapshot, snapshotPath, rootDir: manifest.root, onConflict: promptDecision })) {
      if (ev.kind === 'log') console.log(`[${ev.level}] ${ev.message}`);
      else if (ev.kind === 'phase') console.log(`-- ${ev.project.group}/${ev.project.name}: ${ev.phase}`);
      else if (ev.kind === 'project-error') console.log(`!! ${ev.project.group}/${ev.project.name}: ${ev.error}`);
      else if (ev.kind === 'done') console.log('OK  restore complete');
    }
    // engine.restore closes the reader in its finally block; no extra close here.
  });
```

- [ ] **Step 2: Typecheck + smoke**

Run: `npm run typecheck && npm run build && node dist/index.js snapshot restore --help`
Expected: usage prints `--only` and `--on-conflict`.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/snapshot.ts
git commit -m "feat(snapshot): pm snapshot restore CLI command"
```

---

## Task 19: CLI `pm snapshot list`

**Files:**
- Modify: `src/cli/commands/snapshot.ts`

- [ ] **Step 1: Implement**

Append inside `registerSnapshot`:
```ts
cmd.command('list')
  .description('List snapshots in snapshotDir (or scan the filesystem with --global / --scan)')
  .option('--global', 'scan $HOME recursively')
  .option('--scan <root>', 'scan an arbitrary directory recursively')
  .action(async (opts: { global?: boolean; scan?: string }) => {
    const store = new ManifestStore();
    const manifest = await store.load();
    const dir = opts.scan ? expandHome(opts.scan)
              : opts.global ? os.homedir()
              : expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
    const files = await scanForSnapshots(dir);
    files.sort((a, b) => (a < b ? 1 : -1)); // newest-first by timestamp prefix
    for (const f of files) console.log(f);
    if (files.length === 0) console.log(`(no snapshots under ${dir})`);
  });
```

- [ ] **Step 2: Smoke**

Run: `npm run build && node dist/index.js snapshot list --help`
Expected: lists `--global` and `--scan`.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/snapshot.ts
git commit -m "feat(snapshot): pm snapshot list (with --global / --scan)"
```

---

## Task 20: CLI integration test — roundtrip

**Files:**
- Create: `test/integration/snapshot-cli.test.ts`

- [ ] **Step 1: Write the integration test**

Create `test/integration/snapshot-cli.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';

const PM = path.resolve('dist/index.js');
let workspace: string;
let manifestDir: string;
let snapshotDir: string;
let upstream: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-snap-cli-'));
  manifestDir = path.join(workspace, '.config', 'node-pm');
  await fs.mkdir(manifestDir, { recursive: true });
  snapshotDir = path.join(workspace, 'snaps');
  upstream = path.join(workspace, 'upstream', 'demo.git');
  await fs.mkdir(path.dirname(upstream), { recursive: true });
  await execa('git', ['init', '--bare', upstream]);

  // Create a working repo whose origin is the bare upstream
  const work = path.join(workspace, 'projects', 'g', 'demo');
  await fs.mkdir(work, { recursive: true });
  const sg = simpleGit(work);
  await sg.init();
  await sg.addConfig('user.email', 'test@example.com');
  await sg.addConfig('user.name', 'Test');
  await fs.writeFile(path.join(work, 'a.txt'), 'hello\n');
  await sg.add('a.txt');
  await sg.commit('init');
  await sg.addRemote('origin', upstream);
  await sg.push('origin', 'master', ['--set-upstream']);

  // Add an untracked file
  await fs.writeFile(path.join(work, 'note.md'), 'untracked\n');

  // Write the manifest
  await fs.writeFile(path.join(manifestDir, 'projects.json'), JSON.stringify({
    version: 1,
    root: path.join(workspace, 'projects'),
    concurrency: 1,
    snapshotDir,
    projects: [{ name: 'demo', group: 'g', url: upstream }],
  }, null, 2));

  originalEnv = { ...process.env };
  process.env.XDG_CONFIG_HOME = path.join(workspace, '.config');
});

afterEach(async () => {
  process.env = originalEnv;
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('pm snapshot CLI roundtrip', () => {
  it('create then restore reproduces tracked + untracked content', async () => {
    await execa('node', [PM, 'snapshot', 'create', '--all']);
    const snaps = await fs.readdir(snapshotDir);
    expect(snaps.some((s) => s.endsWith('.npmsnap'))).toBe(true);
    const archive = path.join(snapshotDir, snaps.find((s) => s.endsWith('.npmsnap'))!);

    // Wipe the working repo
    await fs.rm(path.join(workspace, 'projects', 'g', 'demo'), { recursive: true, force: true });

    await execa('node', [PM, 'snapshot', 'restore', archive, '--on-conflict', 'overwrite']);
    const restored = await fs.readFile(path.join(workspace, 'projects', 'g', 'demo', 'a.txt'), 'utf8');
    expect(restored).toBe('hello\n');
    const note = await fs.readFile(path.join(workspace, 'projects', 'g', 'demo', 'note.md'), 'utf8');
    expect(note).toBe('untracked\n');
  }, 60000);
});
```

- [ ] **Step 2: Build then run**

Run: `npm run build && npx vitest run test/integration/snapshot-cli.test.ts`
Expected: PASS within 60s.

- [ ] **Step 3: Commit**

```bash
git add test/integration/snapshot-cli.test.ts
git commit -m "test(snapshot): CLI roundtrip integration"
```

---

## Task 21: TUI `ProgressBar` component

**Files:**
- Create: `src/tui/components/snapshot/ProgressBar.tsx`
- Test: `test/tui/components/snapshot/ProgressBar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `test/tui/components/snapshot/ProgressBar.test.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../../../../src/tui/components/snapshot/ProgressBar.js';

describe('ProgressBar', () => {
  it('renders 0% as an empty bar', () => {
    const { lastFrame } = render(<ProgressBar percent={0} width={10} />);
    expect(lastFrame()).toContain('░'.repeat(10));
  });
  it('renders 100% as a full bar', () => {
    const { lastFrame } = render(<ProgressBar percent={100} width={10} />);
    expect(lastFrame()).toContain('█'.repeat(10));
  });
  it('renders 50% as half full', () => {
    const { lastFrame } = render(<ProgressBar percent={50} width={10} />);
    expect(lastFrame()).toContain('█'.repeat(5) + '░'.repeat(5));
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/tui/components/snapshot/ProgressBar.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/tui/components/snapshot/ProgressBar.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';

type Props = { percent: number; width: number };

export function ProgressBar({ percent, width }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return <Text>{'█'.repeat(filled)}{'░'.repeat(empty)}</Text>;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/tui/components/snapshot/ProgressBar.test.tsx`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/snapshot/ProgressBar.tsx test/tui/components/snapshot/ProgressBar.test.tsx
git commit -m "feat(tui-snapshot): ProgressBar ASCII component"
```

---

## Task 22: TUI building blocks — `ProjectRow`, `LogTail`, `OverallBar`

**Files:**
- Create: `src/tui/components/snapshot/ProjectRow.tsx`
- Create: `src/tui/components/snapshot/LogTail.tsx`
- Create: `src/tui/components/snapshot/OverallBar.tsx`

- [ ] **Step 1: Implement ProjectRow**

Create `src/tui/components/snapshot/ProjectRow.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ProgressBar } from './ProgressBar.js';
import type { Project } from '../../../shared/types.js';

export type RowStatus = 'pending' | 'in-progress' | 'done' | 'error';

type Props = {
  project: Project;
  status: RowStatus;
  percent?: number;
  detail?: string;
};

export function ProjectRow({ project, status, percent = 0, detail }: Props) {
  const icon = status === 'pending' ? '·'
            : status === 'in-progress' ? null
            : status === 'done' ? '✓'
            : '✗';
  const color = status === 'done' ? 'green'
              : status === 'error' ? 'red'
              : status === 'in-progress' ? 'cyan'
              : 'gray';
  return (
    <Box>
      <Box width={3}>
        {icon ? <Text color={color}>{icon}</Text> : <Text color="cyan"><Spinner type="dots" /></Text>}
      </Box>
      <Box width={28}><Text>{project.group}/{project.name}</Text></Box>
      {status === 'in-progress' && (
        <>
          <Text> </Text><ProgressBar percent={percent} width={12} /><Text> {percent}%</Text>
        </>
      )}
      {detail && <Text dimColor>  {detail}</Text>}
    </Box>
  );
}
```

- [ ] **Step 2: Implement LogTail**

Create `src/tui/components/snapshot/LogTail.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';

export type LogLine = { level: 'info' | 'warn'; message: string };
type Props = { lines: LogLine[]; max?: number };

export function LogTail({ lines, max = 10 }: Props) {
  const tail = lines.slice(-max);
  return (
    <Box flexDirection="column">
      {tail.map((l, i) => (
        <Text key={i} color={l.level === 'warn' ? 'yellow' : undefined} dimColor={l.level === 'info'}>
          {l.message}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 3: Implement OverallBar**

Create `src/tui/components/snapshot/OverallBar.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';

type Props = { done: number; total: number; bytes?: number; title?: string };

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OverallBar({ done, total, bytes = 0, title = 'Overall' }: Props) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Box>
      <Text bold>{title}: </Text>
      <ProgressBar percent={percent} width={20} />
      <Text>  {done}/{total} projects</Text>
      {bytes > 0 && <Text dimColor>  · {fmtBytes(bytes)}</Text>}
    </Box>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/snapshot/ProjectRow.tsx src/tui/components/snapshot/LogTail.tsx src/tui/components/snapshot/OverallBar.tsx
git commit -m "feat(tui-snapshot): ProjectRow, LogTail, OverallBar"
```

---

## Task 23: TUI `SnapshotPage` — create mode

**Files:**
- Create: `src/tui/pages/SnapshotPage.tsx`
- Test: `test/tui/pages/SnapshotPage.test.tsx`

- [ ] **Step 1: Failing test (renders create rows + advances on events)**

Create `test/tui/pages/SnapshotPage.test.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { SnapshotPage } from '../../../src/tui/pages/SnapshotPage.js';
import type { Project } from '../../../src/shared/types.js';
import type { SnapshotEvent } from '../../../src/core/snapshot.js';

const projects: Project[] = [
  { name: 'a', group: 'g', url: 'u-a' },
  { name: 'b', group: 'g', url: 'u-b' },
];

async function* feed(events: SnapshotEvent[]) {
  for (const e of events) {
    yield e;
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('SnapshotPage (create)', () => {
  it('renders both projects and marks them done when project-done events arrive', async () => {
    const events: SnapshotEvent[] = [
      { kind: 'project-start', project: projects[0] },
      { kind: 'project-done', project: projects[0], bytes: 10, warnings: 0 },
      { kind: 'project-start', project: projects[1] },
      { kind: 'project-done', project: projects[1], bytes: 20, warnings: 0 },
      { kind: 'done', snapshot: { version: 1, createdAt: new Date().toISOString(), projects: [] }, path: '/x.npmsnap' },
    ];
    const { lastFrame } = render(
      <SnapshotPage mode="create" projects={projects} events={feed(events)} onExit={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const out = lastFrame() ?? '';
    expect(out).toContain('g/a');
    expect(out).toContain('g/b');
    expect(out).toContain('✓');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/tui/pages/SnapshotPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/tui/pages/SnapshotPage.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProjectRow, type RowStatus } from '../components/snapshot/ProjectRow.js';
import { LogTail, type LogLine } from '../components/snapshot/LogTail.js';
import { OverallBar } from '../components/snapshot/OverallBar.js';
import type { Project } from '../../shared/types.js';
import type { SnapshotEvent } from '../../core/snapshot.js';

type Props = {
  mode: 'create' | 'restore';
  projects: Project[];
  events: AsyncIterable<SnapshotEvent>;
  onExit: () => void;
};

type RowState = { status: RowStatus; percent: number; detail?: string };

function keyOf(p: Project): string { return `${p.group}/${p.name}`; }

export function SnapshotPage({ mode, projects, events, onExit }: Props) {
  const [rows, setRows] = useState<Map<string, RowState>>(
    () => new Map(projects.map((p) => [keyOf(p), { status: 'pending', percent: 0 }])),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [bytes, setBytes] = useState(0);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);

  useInput((_input, key) => { if (key.escape) onExit(); });

  useEffect(() => {
    let stop = false;
    (async () => {
      for await (const ev of events) {
        if (stop) break;
        setRows((prev) => {
          const next = new Map(prev);
          if (ev.kind === 'project-start') next.set(keyOf(ev.project), { status: 'in-progress', percent: 0 });
          if (ev.kind === 'file-progress') {
            const k = keyOf(ev.project);
            const r = next.get(k);
            if (r) next.set(k, { ...r, percent: Math.round((ev.current / Math.max(1, ev.total)) * 100), detail: ev.path });
          }
          if (ev.kind === 'project-done') next.set(keyOf(ev.project), { status: 'done', percent: 100 });
          if (ev.kind === 'project-error') next.set(keyOf(ev.project), { status: 'error', percent: 0, detail: ev.error });
          return next;
        });
        if (ev.kind === 'project-done') {
          setDone((d) => d + 1);
          setBytes((b) => b + (ev as Extract<SnapshotEvent, { kind: 'project-done' }>).bytes);
        }
        if (ev.kind === 'log') setLog((l) => [...l, { level: ev.level, message: ev.message }]);
        if (ev.kind === 'done') setFinished(true);
      }
    })();
    return () => { stop = true; };
  }, [events]);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyanBright">{mode === 'create' ? 'Creating snapshot' : 'Restoring snapshot'}</Text>
      <Box marginTop={1}><OverallBar done={done} total={projects.length} bytes={bytes} /></Box>
      <Box marginTop={1} flexDirection="column">
        {projects.map((p) => {
          const r = rows.get(keyOf(p))!;
          return <ProjectRow key={keyOf(p)} project={p} status={r.status} percent={r.percent} detail={r.detail} />;
        })}
      </Box>
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        <LogTail lines={log} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{finished ? 'Done. Press Esc to return.' : 'Esc cancel'}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/tui/pages/SnapshotPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/pages/SnapshotPage.tsx test/tui/pages/SnapshotPage.test.tsx
git commit -m "feat(tui): SnapshotPage live progress (create + restore)"
```

---

## Task 24: TUI `SettingsPage` — minimal (snapshotDir)

**Files:**
- Create: `src/tui/pages/SettingsPage.tsx`

- [ ] **Step 1: Implement**

Create `src/tui/pages/SettingsPage.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ManifestStore } from '../../core/manifest.js';
import { getDefaultSnapshotDir } from '../../shared/paths.js';

type Props = {
  initialSnapshotDir?: string;
  onExit: () => void;
};

export function SettingsPage({ initialSnapshotDir, onExit }: Props) {
  const [value, setValue] = useState<string>(initialSnapshotDir ?? getDefaultSnapshotDir());
  const [status, setStatus] = useState<string>('');

  useInput((_input, key) => { if (key.escape) onExit(); });

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyanBright">Settings</Text>
      <Box marginTop={1}>
        <Text dimColor>snapshotDir: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={async (v) => {
            const store = new ManifestStore();
            const m = await store.load();
            await store.save({ ...m, snapshotDir: v });
            setStatus(`Saved → ${v}`);
          }}
        />
      </Box>
      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}
      <Box marginTop={1}><Text dimColor>Enter save · Esc back</Text></Box>
    </Box>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/pages/SettingsPage.tsx
git commit -m "feat(tui): minimal SettingsPage exposing snapshotDir"
```

---

## Task 25: Wire `SnapshotPage` + `SettingsPage` into the TUI router

**Files:**
- Modify: `src/tui/pages/HomePage.tsx`
- Modify: `src/tui/App.tsx`

The router lives in `src/tui/App.tsx` and uses a `usePage(...)` hook (`page.goto(id)`, `page.reset('home')`) plus a `switch (page.current.id)` block at the bottom. `HomePage.tsx` exposes a `HomeAction` union and an `onSelect(action)` callback that the `App` maps to `page.goto(...)` calls in `handleHomeSelect`.

- [ ] **Step 1: Extend `HomeAction` and the menu list**

In `src/tui/pages/HomePage.tsx`, update the type and the two menu arrays:
```ts
export type HomeAction =
  | 'projects'
  | 'bulkClone'
  | 'addProject'
  | 'wizard'
  | 'export'
  | 'snapshotCreate'
  | 'snapshotRestore'
  | 'settings'
  | 'quit';
```
Inside the populated (`hasManifest && totalProjects > 0`) list, add (after the `export` entry, before `quit`):
```ts
{ label: '📦  Snapshot create — capture project working state', value: 'snapshotCreate' },
{ label: '♻️   Snapshot restore — restore from a .npmsnap',     value: 'snapshotRestore' },
{ label: '⚙️   Settings        — configure snapshotDir',        value: 'settings' },
```
Inside the empty-state list, append the same `settings` entry (and `snapshotRestore` so empty users can still restore).

- [ ] **Step 2: Build a `useSnapshotRun` hook**

Create `src/tui/hooks/useSnapshotRun.ts`:
```ts
import { useMemo, useRef } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { GitOps } from '../../core/git.js';
import { SnapshotEngine, type SnapshotEvent } from '../../core/snapshot.js';
import {
  openZipBlobStoreReader,
  openZipBlobStoreWriter,
  openDirBlobStoreReader,
  openDirBlobStoreWriter,
} from '../../core/blob-store.js';
import { expandHome, getDefaultSnapshotDir } from '../../shared/paths.js';
import type { Manifest, Project } from '../../shared/types.js';

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function useSnapshotRun(manifest: Manifest | null) {
  const engineRef = useRef<SnapshotEngine | null>(null);
  const engine = useMemo(() => {
    if (!manifest) return null;
    const e = new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) => p.endsWith('.npmsnap') ? openZipBlobStoreWriter(p) : openDirBlobStoreWriter(p),
      openReader: (p) => p.endsWith('.npmsnap') ? openZipBlobStoreReader(p) : openDirBlobStoreReader(p),
      resolveProjectPath: (_root, proj) => path.join(expandHome(manifest.root), proj.group, proj.name),
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });
    engineRef.current = e;
    return e;
  }, [manifest]);

  return {
    engine,
    async startCreate(projects: Project[]): Promise<{ iterable: AsyncIterable<SnapshotEvent>; outPath: string }> {
      if (!manifest || !engine) throw new Error('No manifest');
      const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `${ts()}.npmsnap`);
      const iterable = engine.create({ projects, rootDir: manifest.root, snapshotPath: outPath });
      return { iterable, outPath };
    },
  };
}
```

- [ ] **Step 3: Route the new actions in `App.tsx`**

In `src/tui/App.tsx`:

1. Add imports near the existing page imports:
```ts
import { SnapshotPage } from './pages/SnapshotPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { useSnapshotRun } from './hooks/useSnapshotRun.js';
import { scanForSnapshots } from '../core/snapshot-scanner.js';
import { SnapshotSchema } from '../shared/types.js';
import { openZipBlobStoreReader } from '../core/blob-store.js';
import { expandHome, getDefaultSnapshotDir } from '../shared/paths.js';
import type { SnapshotEvent } from '../core/snapshot.js';
```

2. Inside `App()`, after `const snapshot = useSnapshot(manifest);`, add:
```ts
const snapRun = useSnapshotRun(manifest);
const [snapEvents, setSnapEvents] = React.useState<AsyncIterable<SnapshotEvent> | null>(null);
const [snapMode, setSnapMode] = React.useState<'create' | 'restore'>('create');
const [snapProjects, setSnapProjects] = React.useState<Project[]>([]);
```

3. Extend `handleHomeSelect`:
```ts
else if (action === 'snapshotCreate') {
  if (!manifest) return;
  const all = projects;
  void snapRun.startCreate(all).then(({ iterable }) => {
    setSnapMode('create');
    setSnapProjects(all);
    setSnapEvents(iterable);
    page.goto('snapshot');
  });
}
else if (action === 'snapshotRestore') {
  if (!manifest) return;
  const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
  void scanForSnapshots(dir).then(async (files) => {
    files.sort((a, b) => (a < b ? 1 : -1));
    if (files.length === 0) return;
    const reader = await openZipBlobStoreReader(files[0]);
    const snap = SnapshotSchema.parse(JSON.parse(await reader.readMetadata('snapshot.json')));
    // Pre-opened reader passed via a closure so SnapshotEngine uses it directly.
    const restoreEngine = new (await import('../core/snapshot.js')).SnapshotEngine({
      git: snapRun.engine!['deps'].git,
      openWriter: snapRun.engine!['deps'].openWriter,
      openReader: () => Promise.resolve(reader),
      resolveProjectPath: snapRun.engine!['deps'].resolveProjectPath,
      destExists: snapRun.engine!['deps'].destExists,
      removeDest: snapRun.engine!['deps'].removeDest,
    });
    setSnapMode('restore');
    setSnapProjects(snap.projects.map((p) => ({ name: p.name, group: p.group, url: p.url })));
    setSnapEvents(restoreEngine.restore({
      snapshot: snap,
      snapshotPath: files[0],
      rootDir: manifest.root,
      onConflict: async () => 'overwrite', // first cut: overwrite. Proper prompt UI is a follow-up.
    }));
    page.goto('snapshot');
  });
}
else if (action === 'settings') page.goto('settings');
```

4. Add the two new `case` arms in the `switch (page.current.id)` block (above the `default`):
```tsx
case 'snapshot':
  if (!snapEvents) return null;
  return (
    <SnapshotPage
      mode={snapMode}
      projects={snapProjects}
      events={snapEvents}
      onExit={() => { setSnapEvents(null); page.reset('home'); void reload(); }}
    />
  );
case 'settings':
  return (
    <SettingsPage
      initialSnapshotDir={manifest?.snapshotDir}
      onExit={() => page.reset('home')}
    />
  );
```

- [ ] **Step 4: Manual smoke**

Run: `npm run build && node dist/index.js`
Expected: TUI launches with three new menu entries. Selecting Settings opens the snapshotDir editor; Snapshot create snapshots every project in the manifest; Snapshot restore restores the most recent `.npmsnap` from `snapshotDir`.

- [ ] **Step 5: Commit**

```bash
git add src/tui/pages/HomePage.tsx src/tui/App.tsx src/tui/hooks/useSnapshotRun.ts
git commit -m "feat(tui): route Snapshot create/restore + Settings from Home"
```

---

## Task 26: Integration roundtrip test

**Files:**
- Create: `test/integration/snapshot-roundtrip.test.ts`

- [ ] **Step 1: Write the test**

Create `test/integration/snapshot-roundtrip.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';
import { GitOps } from '../../src/core/git.js';
import { SnapshotEngine } from '../../src/core/snapshot.js';
import { openZipBlobStoreReader, openZipBlobStoreWriter } from '../../src/core/blob-store.js';

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
  await sg.push('origin', 'master', ['--set-upstream']);

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
    // capture
    for await (const _ of engine.create({ projects: [project], rootDir: workspace, snapshotPath })) {
      void _;
    }
    // wipe and restore
    const restoredRoot = path.join(workspace, 'restored');
    const restoredWork = path.join(restoredRoot, 'g', 'work');
    const reader = await openZipBlobStoreReader(snapshotPath);
    const meta = JSON.parse(await reader.readMetadata('snapshot.json'));

    const engine2 = new SnapshotEngine({
      git: new GitOps(),
      openWriter: (p) => openZipBlobStoreWriter(p),
      openReader: () => Promise.resolve(reader),
      resolveProjectPath: (_r, p) => path.join(restoredRoot, p.group, p.name),
      destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
      removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
    });
    for await (const _ of engine2.restore({ snapshot: meta, snapshotPath, rootDir: restoredRoot, onConflict: async () => 'overwrite' })) {
      void _;
    }

    expect(await fs.readFile(path.join(restoredWork, 'tracked.txt'), 'utf8')).toBe('hello\nchanged\n');
    expect(await fs.readFile(path.join(restoredWork, '.env'), 'utf8')).toBe('SECRET=abc\n');
    const png = await fs.readFile(path.join(restoredWork, 'note.png'));
    const origPng = await fs.readFile(path.join(work, 'note.png'));
    expect(png.equals(origPng)).toBe(true);
    // engine2.restore already closed the reader in its finally block.
  }, 60000);
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run test/integration/snapshot-roundtrip.test.ts`
Expected: PASS within 60s.

- [ ] **Step 3: Commit**

```bash
git add test/integration/snapshot-roundtrip.test.ts
git commit -m "test(snapshot): end-to-end roundtrip integration"
```

---

## Task 27: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add CLI section**

Find the CLI commands section in `README.md` (under "## CLI commands") and append:
```
pm snapshot create [<name>...] [--all] [--group X] [--out PATH] [--label S] [--no-zip]
pm snapshot restore <path>  [--only <name>] [--on-conflict skip|overwrite|abort]
pm snapshot list            [--global | --scan <root>]
```

- [ ] **Step 2: Add a Snapshot section**

Add after the Manifest section:
```md
## Snapshots

`pm snapshot` captures the live working state of selected projects — current commit, branch, uncommitted tracked changes, untracked files, gitignored files (except `node_modules/`), and stashes — into a single `.npmsnap` archive (a plain zip). `pm snapshot restore` rehydrates a fresh clone byte-exact.

The default location is `~/.config/node-pm/snapshots/` (configurable via `pm config set snapshotDir <path>` or the TUI Settings page).

**Security:** snapshots may contain `.env` files and other secrets. Treat them as sensitive — do **not** push `.npmsnap` files to public Gists or repositories.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(snapshot): document pm snapshot commands and security caveat"
```

---

## Self-review checklist (run after Task 27)

1. **Spec coverage** — for every section in `docs/superpowers/specs/2026-05-19-project-snapshot-design.md`, point at a task. The cross-platform section, the security section, the cancellation section, and the conflict prompt are covered by the soft-error policy in `SnapshotEngine`, the warn-pattern logging during capture (Task 12 / Task 13), Task 15, and Task 18 / Task 25.
2. **Placeholder scan** — no "TBD"/"TODO"/"add appropriate handling" left in this plan.
3. **Type consistency** — `BlobRef`, `Snapshot`, `SnapshotEvent`, `SnapshotPhase`, `SnapshotDeps`, `RestoreConflictDecision`, and the `GitOps` extensions are referenced consistently across tasks (Tasks 3, 5, 7, 9–11, 12–15, 17–18).
4. **Run the full suite** at the end:
   ```bash
   npm run typecheck
   npm test
   ```
   Expected: all green.

## Out of scope (carried as follow-ups in the spec)

- Gist push/pull for snapshots.
- Differential snapshots.
- Submodule capture.
- Git LFS object capture.
- Snapshot resume (`--resume`).
