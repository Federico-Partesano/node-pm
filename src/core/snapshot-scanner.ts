import fs from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git']);

export async function scanForSnapshots(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (
        e.isFile() &&
        e.name.endsWith('.npmsnap') &&
        !e.name.endsWith('.tmp.npmsnap')
      ) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}
