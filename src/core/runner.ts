import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import type { Project, RunHandle } from '../shared/types.js';
import { PackageManager } from './pm.js';

export class ScriptRunner {
  private pm = new PackageManager();

  async spawn(project: Project, script: string, projectPath: string): Promise<RunHandle> {
    const pmName = await this.pm.detect(projectPath);
    const proc = execa(pmName, ['run', script], {
      cwd: projectPath,
      stdout: 'pipe',
      stderr: 'pipe',
      reject: false,
    });

    const stdoutCbs = new Set<(l: string) => void>();
    const stderrCbs = new Set<(l: string) => void>();

    let resolveWait!: (code: number) => void;
    const waitPromise = new Promise<number>((r) => { resolveWait = r; });

    const handle: RunHandle = {
      id: randomUUID(),
      project,
      script,
      status: 'running',
      exitCode: null,
      onStdout(cb) { stdoutCbs.add(cb); return () => { stdoutCbs.delete(cb); }; },
      onStderr(cb) { stderrCbs.add(cb); return () => { stderrCbs.delete(cb); }; },
      wait: () => waitPromise,
      kill() {
        handle.status = 'killed';
        (proc as unknown as { kill: (sig?: string) => void }).kill('SIGTERM');
      },
    };

    if (proc.stdout) {
      readline.createInterface({ input: proc.stdout }).on('line', (l) => stdoutCbs.forEach((cb) => cb(l)));
    }
    if (proc.stderr) {
      readline.createInterface({ input: proc.stderr }).on('line', (l) => stderrCbs.forEach((cb) => cb(l)));
    }

    void (proc as unknown as Promise<{ exitCode: number }>).then((res) => {
      handle.exitCode = res.exitCode;
      if (handle.status === 'running') handle.status = 'exited';
      resolveWait(res.exitCode);
    }).catch((err) => {
      // spawn failure (e.g., ENOENT) — mark exited and resolve with non-zero
      handle.exitCode = 127;
      handle.status = 'exited';
      resolveWait(127);
      void err;
    });

    return handle;
  }
}
