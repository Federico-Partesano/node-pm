import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  openDirBlobStoreWriter,
  openDirBlobStoreReader,
  openZipBlobStoreWriter,
  openZipBlobStoreReader,
} from '../../src/core/blob-store.js';

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

  it('dedupes identical content inside the archive', async () => {
    const archive = path.join(tmpRoot, 'dedup.npmsnap');
    const writer = await openZipBlobStoreWriter(archive);
    const a = path.join(tmpRoot, 'a.txt');
    const b = path.join(tmpRoot, 'b.txt');
    await fs.writeFile(a, 'same');
    await fs.writeFile(b, 'same');
    const refA = await writer.putStream({ absPath: a, relPath: 'a.txt' });
    const refB = await writer.putStream({ absPath: b, relPath: 'b.txt' });
    await writer.close();
    expect(refA.blob).toBe(refB.blob);
  });
});
