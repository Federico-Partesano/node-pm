import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline, finished } from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { PassThrough, Readable } from 'node:stream';
import type { BlobRef } from '../shared/types.js';

function makeHashTap(): { tap: PassThrough; finalize: () => { sha: string; bytes: number } } {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const tap = new PassThrough();
  tap.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  return {
    tap,
    finalize: () => ({ sha: hash.digest('hex'), bytes }),
  };
}

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
      const { tap, finalize } = makeHashTap();
      const src = createReadStream(absPath);
      const dst = createWriteStream(tmp);
      await pipeline(src, tap, dst);
      const { sha, bytes } = finalize();
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

export async function openZipBlobStoreWriter(archivePath: string): Promise<BlobStoreWriter> {
  const tmpArchive = `${archivePath}.tmp.npmsnap`;
  const zip = new yazl.ZipFile();
  const out = createWriteStream(tmpArchive);
  zip.outputStream.pipe(out);
  const seen = new Set<string>();
  const stagingDir = path.join(path.dirname(archivePath), '.npmsnap-staging');
  await fs.mkdir(stagingDir, { recursive: true });

  return {
    async putStream({ absPath, relPath }) {
      const staging = path.join(stagingDir, `${crypto.randomBytes(8).toString('hex')}.bin`);
      const { tap, finalize } = makeHashTap();
      const src = createReadStream(absPath);
      const dst = createWriteStream(staging);
      await pipeline(src, tap, dst);
      const { sha, bytes } = finalize();
      const stat = await fs.stat(absPath);
      const mode = (stat.mode & 0o777).toString(8).padStart(4, '0');

      if (!seen.has(sha)) {
        zip.addFile(staging, `blobs/${sha}.bin`, { compress: false });
        seen.add(sha);
        // staging file is held open by yazl until close(); cleaned up after archive close
      } else {
        await fs.unlink(staging).catch(() => {});
      }
      return { path: relPath, blob: sha, size: bytes, mode };
    },

    async writeMetadata(name, json) {
      zip.addBuffer(Buffer.from(json, 'utf8'), name, { compress: false });
    },

    async close() {
      const done = finished(out);
      zip.end();
      await done;
      await fs.rename(tmpArchive, archivePath);
      await fs.rm(stagingDir, { recursive: true, force: true });
    },
  };
}

export async function openZipBlobStoreReader(archivePath: string): Promise<BlobStoreReader> {
  const entries = new Map<string, yauzl.Entry>();
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: false, autoClose: false }, (err, zf) => {
      if (err || !zf) return reject(err);
      zf.on('entry', (entry: yauzl.Entry) => entries.set(entry.fileName, entry));
      zf.on('end', () => resolve(zf));
      zf.on('error', reject);
    });
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
      return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      });
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
