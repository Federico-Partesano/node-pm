import readline from 'node:readline';
import { execa, type ResultPromise } from 'execa';
import type { Session, TerminalSpec } from '../shared/types.js';

export type SessionEvent =
  | { kind: 'start'; terminal: string; cmd: string; cwd: string }
  | { kind: 'line'; terminal: string; stream: 'stdout' | 'stderr'; text: string }
  | { kind: 'exit'; terminal: string; code: number | null }
  | { kind: 'error'; terminal: string; error: string }
  | { kind: 'killed'; terminal: string }
  | { kind: 'all-done' };

export class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private cap: number) {
    if (cap <= 0) throw new Error('RingBuffer cap must be > 0');
  }
  push(x: T): void {
    this.buf.push(x);
    if (this.buf.length > this.cap) this.buf.splice(0, this.buf.length - this.cap);
  }
  toArray(): T[] {
    return this.buf.slice();
  }
  get length(): number {
    return this.buf.length;
  }
}

export type RunnerOptions = {
  resolveProjectPath: (projectRef: string) => string;
  /** Lines to keep per terminal. Default 500. */
  bufferSize?: number;
  /** Milliseconds to wait between SIGTERM and SIGKILL. Default 3000. */
  killGraceMs?: number;
};

type ProcEntry = {
  spec: TerminalSpec;
  child: ResultPromise;
  cwd: string;
  exited: boolean;
  killing: boolean;
};

export class SessionRunner {
  private opts: Required<RunnerOptions>;
  private procs = new Map<string, ProcEntry>();
  private queue: SessionEvent[] = [];
  private resolveNext: (() => void) | null = null;
  private finished = false;
  private buffers = new Map<string, RingBuffer<{ stream: 'stdout' | 'stderr'; text: string }>>();
  private signal?: AbortSignal;

  constructor(opts: RunnerOptions) {
    this.opts = {
      bufferSize: 500,
      killGraceMs: 3000,
      ...opts,
    };
  }

  buffer(name: string): { stream: 'stdout' | 'stderr'; text: string }[] {
    return this.buffers.get(name)?.toArray() ?? [];
  }

  async *run(session: Session, ctx: { signal?: AbortSignal } = {}): AsyncGenerator<SessionEvent> {
    this.signal = ctx.signal;
    if (ctx.signal) {
      ctx.signal.addEventListener('abort', () => {
        for (const [name, entry] of this.procs) {
          if (!entry.exited) void this.kill(name);
        }
      });
    }
    for (const spec of session.terminals) this.spawnTerminal(spec);

    while (true) {
      while (this.queue.length > 0) yield this.queue.shift()!;
      if (this.finished) break;
      await new Promise<void>((r) => (this.resolveNext = r));
    }
  }

  private spawnTerminal(spec: TerminalSpec): void {
    const cwd = spec.cwd ?? this.opts.resolveProjectPath(spec.projectRef);
    const buf = new RingBuffer<{ stream: 'stdout' | 'stderr'; text: string }>(this.opts.bufferSize);
    this.buffers.set(spec.name, buf);

    let child: ResultPromise;
    try {
      child = execa(spec.cmd, {
        shell: true,
        cwd,
        env: { ...process.env, ...spec.env },
        stdout: 'pipe',
        stderr: 'pipe',
        reject: false,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      this.push({ kind: 'error', terminal: spec.name, error: (err as Error).message });
      this.markExitedIfAllDone();
      return;
    }

    const entry: ProcEntry = { spec, child, cwd, exited: false, killing: false };
    this.procs.set(spec.name, entry);
    this.push({ kind: 'start', terminal: spec.name, cmd: spec.cmd, cwd });

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        buf.push({ stream: 'stdout', text: line });
        this.push({ kind: 'line', terminal: spec.name, stream: 'stdout', text: line });
      });
    }
    if (child.stderr) {
      const rl = readline.createInterface({ input: child.stderr });
      rl.on('line', (line) => {
        buf.push({ stream: 'stderr', text: line });
        this.push({ kind: 'line', terminal: spec.name, stream: 'stderr', text: line });
      });
    }

    child
      .then((res) => {
        entry.exited = true;
        if (entry.killing) {
          this.push({ kind: 'killed', terminal: spec.name });
        } else {
          this.push({ kind: 'exit', terminal: spec.name, code: res.exitCode ?? null });
        }
        this.markExitedIfAllDone();
      })
      .catch((err: Error & { exitCode?: number }) => {
        entry.exited = true;
        if (entry.killing) {
          this.push({ kind: 'killed', terminal: spec.name });
        } else if (typeof err.exitCode === 'number') {
          this.push({ kind: 'exit', terminal: spec.name, code: err.exitCode });
        } else {
          this.push({ kind: 'error', terminal: spec.name, error: err.message });
        }
        this.markExitedIfAllDone();
      });
  }

  async kill(name: string): Promise<void> {
    const entry = this.procs.get(name);
    if (!entry || entry.exited) return;
    entry.killing = true;
    killProc(entry.child, 'SIGTERM');
    const grace = this.opts.killGraceMs;
    await new Promise<void>((r) => setTimeout(r, grace));
    if (!entry.exited) killProc(entry.child, 'SIGKILL');
  }

  async restart(name: string): Promise<void> {
    const entry = this.procs.get(name);
    if (!entry) return;
    if (!entry.exited) await this.kill(name);
    this.procs.delete(name);
    this.spawnTerminal(entry.spec);
  }

  private push(ev: SessionEvent): void {
    this.queue.push(ev);
    const r = this.resolveNext;
    this.resolveNext = null;
    r?.();
  }

  private markExitedIfAllDone(): void {
    const allExited = [...this.procs.values()].every((e) => e.exited);
    if (allExited && this.procs.size > 0) {
      this.push({ kind: 'all-done' });
      this.finished = true;
      const r = this.resolveNext;
      this.resolveNext = null;
      r?.();
    }
  }
}

function killProc(child: ResultPromise, signal: NodeJS.Signals): void {
  if (process.platform === 'win32' || !child.pid) {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  }
}
