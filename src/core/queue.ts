import { EventEmitter } from 'node:events';
import PQueue from 'p-queue';
import type { Progress } from '../shared/types.js';

type TaskFn<T> = (signal: AbortSignal) => Promise<T> | AsyncIterable<Progress>;

export class TaskQueue extends EventEmitter {
  private queue: PQueue;
  private controllers = new Map<string, AbortController>();

  constructor(concurrency: number) {
    super();
    this.queue = new PQueue({ concurrency });
    this.queue.on('idle', () => this.emit('queue:drain'));
  }

  async add<T>(name: string, fn: TaskFn<T>): Promise<T | undefined> {
    const controller = new AbortController();
    this.controllers.set(name, controller);
    const result = await this.queue.add(async (): Promise<T | undefined> => {
      this.emit('task:start', { name });
      try {
        const out = fn(controller.signal);
        let value: T | undefined;
        if (isAsyncIterable<Progress>(out)) {
          for await (const p of out) this.emit('task:progress', { name, progress: p });
        } else {
          value = await out;
        }
        this.emit('task:done', { name, value });
        return value;
      } catch (err) {
        this.emit('task:error', { name, error: err });
        throw err;
      } finally {
        this.controllers.delete(name);
      }
    });
    return result as T | undefined;
  }

  cancel(name: string): void {
    this.controllers.get(name)?.abort();
  }

  cancelAll(): void {
    for (const c of this.controllers.values()) c.abort();
  }

  size(): number {
    return this.queue.size + this.queue.pending;
  }
}

function isAsyncIterable<T>(x: unknown): x is AsyncIterable<T> {
  return !!x && typeof (x as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}
