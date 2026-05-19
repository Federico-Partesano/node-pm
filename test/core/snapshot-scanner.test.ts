import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanForSnapshots } from '../../src/core/snapshot-scanner.js';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

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
    await fs.writeFile(path.join(tmp, 'tmp.tmp.npmsnap'), '');

    const found = await scanForSnapshots(tmp);
    const rels = found.map((p) => path.relative(tmp, p).replace(/\\/g, '/')).sort();
    expect(rels).toEqual(['a/b/three.npmsnap', 'a/two.npmsnap', 'one.npmsnap'].sort());
  });
});
