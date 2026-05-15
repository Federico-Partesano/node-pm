import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execa } from 'execa';
import type { PMName, Progress } from '../shared/types.js';
import { PMError } from '../shared/errors.js';

const lockMap: Array<[string, PMName]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

export class PackageManager {
  async detect(projectPath: string): Promise<PMName> {
    for (const [file, name] of lockMap) {
      const found = await fs.stat(path.join(projectPath, file)).catch(() => null);
      if (found) return name;
    }
    return 'npm';
  }

  async *install(projectPath: string): AsyncIterable<Progress> {
    const pm = await this.detect(projectPath);
    const proc = execa(pm, ['install'], { cwd: projectPath, stdout: 'pipe', stderr: 'pipe' });
    if (proc.stdout) {
      const rl = readline.createInterface({ input: proc.stdout });
      const queue: Progress[] = [];
      let resolveNext: (() => void) | null = null;
      let done = false;
      rl.on('line', (line) => {
        queue.push({ phase: 'install', message: line });
        resolveNext?.();
      });
      proc.then(() => { done = true; resolveNext?.(); }).catch(() => { done = true; resolveNext?.(); });
      while (true) {
        while (queue.length > 0) yield queue.shift()!;
        if (done) break;
        await new Promise<void>((r) => (resolveNext = r));
      }
    }
    try {
      await proc;
    } catch (err) {
      throw new PMError(`Install failed in ${projectPath} (${pm})`, 'E_PM_INSTALL', err as Error);
    }
  }
}
