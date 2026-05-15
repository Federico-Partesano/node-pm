import { describe, it, expect, vi } from 'vitest';
import { TaskQueue } from '../../src/core/queue.js';

describe('TaskQueue', () => {
  it('runs a task and emits start+done', async () => {
    const q = new TaskQueue(2);
    const start = vi.fn();
    const done = vi.fn();
    q.on('task:start', start);
    q.on('task:done', done);
    const result = await q.add('t1', async () => 42);
    expect(result).toBe(42);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ name: 't1' }));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ name: 't1', value: 42 }));
  });

  it('emits task:error and rejects on failure', async () => {
    const q = new TaskQueue(2);
    const errEvt = vi.fn();
    q.on('task:error', errEvt);
    await expect(q.add('t1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(errEvt).toHaveBeenCalled();
  });

  it('respects concurrency limit', async () => {
    const q = new TaskQueue(2);
    let active = 0, max = 0;
    const job = async () => {
      active++; max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    };
    await Promise.all([1,2,3,4,5].map((i) => q.add(`t${i}`, job)));
    expect(max).toBeLessThanOrEqual(2);
  });

  it('forwards progress from async iterables', async () => {
    const q = new TaskQueue(1);
    const prog = vi.fn();
    q.on('task:progress', prog);
    await q.add('t1', async function* () {
      yield { phase: 'a', percent: 10 };
      yield { phase: 'b', percent: 90 };
    });
    expect(prog).toHaveBeenCalledTimes(2);
  });

  it('emits queue:drain when empty', async () => {
    const q = new TaskQueue(2);
    const drain = vi.fn();
    q.on('queue:drain', drain);
    await q.add('t1', async () => 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(drain).toHaveBeenCalled();
  });

  it('aborts via signal', async () => {
    const q = new TaskQueue(1);
    const p = q.add('t1', async (signal) => {
      await new Promise((res, rej) => {
        signal.addEventListener('abort', () => rej(new Error('aborted')));
        setTimeout(res, 1000);
      });
    });
    q.cancel('t1');
    await expect(p).rejects.toThrow('aborted');
  });
});
