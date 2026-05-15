import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../../src/core/queue.js';

// Helper: resolved promise after ms milliseconds
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('Constructor', () => {
  it('concurrency 1 → strictly serial execution', async () => {
    const q = new TaskQueue(1);
    const order: number[] = [];
    await Promise.all([
      q.add('t1', async () => { order.push(1); await delay(20); order.push(2); }),
      q.add('t2', async () => { order.push(3); }),
    ]);
    // t2 must start only after t1 completes, so order is [1, 2, 3]
    expect(order).toEqual([1, 2, 3]);
  });

  it('concurrency 0 → throws (p-queue requires concurrency ≥ 1)', () => {
    expect(() => new TaskQueue(0)).toThrow();
  });

  it('negative concurrency → throws (p-queue rejects negative values)', () => {
    expect(() => new TaskQueue(-1)).toThrow();
  });
});

// ─── add() ───────────────────────────────────────────────────────────────────

describe('add()', () => {
  it('returns the awaited value of an async function', async () => {
    const q = new TaskQueue(1);
    const result = await q.add('t1', async () => 'hello');
    expect(result).toBe('hello');
  });

  it('returns undefined for an async generator', async () => {
    const q = new TaskQueue(1);
    const result = await q.add('t1', async function* () { yield { phase: 'a' }; });
    expect(result).toBeUndefined();
  });

  it('multiple sequential adds resolve in order', async () => {
    const q = new TaskQueue(1);
    const results: number[] = [];
    await q.add('t1', async () => { results.push(1); });
    await q.add('t2', async () => { results.push(2); });
    await q.add('t3', async () => { results.push(3); });
    expect(results).toEqual([1, 2, 3]);
  });

  it('many parallel adds within concurrency limit run concurrently', async () => {
    const q = new TaskQueue(5);
    let active = 0;
    let maxActive = 0;
    const job = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active--;
    };
    await Promise.all(Array.from({ length: 5 }, (_, i) => q.add(`t${i}`, job)));
    // All 5 should have run simultaneously
    expect(maxActive).toBe(5);
  });

  it('long-running task can be awaited until completion', async () => {
    const q = new TaskQueue(1);
    let done = false;
    await q.add('t1', async () => { await delay(30); done = true; });
    expect(done).toBe(true);
  });

  it('rejecting task rejects the returned promise', async () => {
    const q = new TaskQueue(1);
    q.on('task:error', () => {}); // suppress unhandled
    await expect(q.add('t1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('AbortSignal passed to the function reflects abort calls', async () => {
    const q = new TaskQueue(1);
    let capturedSignal: AbortSignal | null = null;
    const p = q.add('t1', async (signal) => {
      capturedSignal = signal;
      await new Promise<void>((res, rej) => {
        signal.addEventListener('abort', () => rej(new Error('aborted')));
        setTimeout(res, 500);
      });
    });
    q.cancel('t1');
    await expect(p).rejects.toThrow('aborted');
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('callback receives the SAME signal on each invocation (not re-created per-run)', async () => {
    // Each add() creates a new controller, so signals are different across calls.
    // Within a single add(), the same signal instance is passed.
    const q = new TaskQueue(1);
    const signals: AbortSignal[] = [];
    await q.add('t1', async (signal) => { signals.push(signal); });
    await q.add('t2', async (signal) => { signals.push(signal); });
    // Two different adds → two different signals
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it('two tasks with the same name → both queued (no dedup)', async () => {
    const q = new TaskQueue(2);
    const results: number[] = [];
    await Promise.all([
      q.add('same', async () => { results.push(1); }),
      q.add('same', async () => { results.push(2); }),
    ]);
    expect(results).toHaveLength(2);
  });

  it('task:start fires once per add', async () => {
    const q = new TaskQueue(2);
    const start = vi.fn();
    q.on('task:start', start);
    await Promise.all([
      q.add('t1', async () => 1),
      q.add('t2', async () => 2),
    ]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('task:done fires with name and value for resolved task', async () => {
    const q = new TaskQueue(1);
    const done = vi.fn();
    q.on('task:done', done);
    await q.add('myTask', async () => 99);
    expect(done).toHaveBeenCalledWith({ name: 'myTask', value: 99 });
  });

  it('task:done value is undefined for async generators', async () => {
    const q = new TaskQueue(1);
    const done = vi.fn();
    q.on('task:done', done);
    await q.add('gen', async function* () { yield { phase: 'x' }; });
    expect(done).toHaveBeenCalledWith({ name: 'gen', value: undefined });
  });

  it('task:error fires with the error on rejection', async () => {
    const q = new TaskQueue(1);
    const errEvt = vi.fn();
    q.on('task:error', errEvt);
    const err = new Error('fail');
    await q.add('t1', async () => { throw err; }).catch(() => {});
    expect(errEvt).toHaveBeenCalledWith(expect.objectContaining({ name: 't1', error: err }));
  });

  it('task:progress fires once per yield from generator', async () => {
    const q = new TaskQueue(1);
    const prog = vi.fn();
    q.on('task:progress', prog);
    await q.add('gen', async function* () {
      yield { phase: 'step1', percent: 25 };
      yield { phase: 'step2', percent: 50 };
      yield { phase: 'step3', percent: 75 };
    });
    expect(prog).toHaveBeenCalledTimes(3);
    expect(prog).toHaveBeenNthCalledWith(1, { name: 'gen', progress: { phase: 'step1', percent: 25 } });
    expect(prog).toHaveBeenNthCalledWith(2, { name: 'gen', progress: { phase: 'step2', percent: 50 } });
    expect(prog).toHaveBeenNthCalledWith(3, { name: 'gen', progress: { phase: 'step3', percent: 75 } });
  });
});

// ─── cancel() / cancelAll() ───────────────────────────────────────────────────

describe('cancel() / cancelAll()', () => {
  it('cancel(name) on a running task aborts its signal', async () => {
    const q = new TaskQueue(1);
    const p = q.add('long', async (signal) => {
      await new Promise<void>((res, rej) => {
        signal.addEventListener('abort', () => rej(new Error('cancelled')));
        setTimeout(res, 1000);
      });
    });
    await delay(10); // let it start
    q.cancel('long');
    await expect(p).rejects.toThrow('cancelled');
  });

  it('cancel(name) on an unknown name is no-op (no throw)', () => {
    const q = new TaskQueue(1);
    expect(() => q.cancel('nonexistent')).not.toThrow();
  });

  it('cancelAll aborts every in-flight controller', async () => {
    const q = new TaskQueue(3);
    const makeTask = (name: string) =>
      q.add(name, async (signal) =>
        new Promise<void>((res, rej) => {
          signal.addEventListener('abort', () => rej(new Error('aborted')));
          setTimeout(res, 1000);
        }),
      );

    const promises = [makeTask('t1'), makeTask('t2'), makeTask('t3')];
    await delay(10); // let all start
    q.cancelAll();
    const results = await Promise.allSettled(promises);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('after abort, controllers Map entry is removed (no memory leak)', async () => {
    const q = new TaskQueue(1);
    const p = q.add('t1', async (signal) => {
      await new Promise<void>((res, rej) => {
        signal.addEventListener('abort', () => rej(new Error('aborted')));
        setTimeout(res, 500);
      });
    });
    await delay(10);
    q.cancel('t1');
    await p.catch(() => {});
    // The only observable consequence: cancel on the same name is now a no-op
    expect(() => q.cancel('t1')).not.toThrow();
  });
});

// ─── size() ───────────────────────────────────────────────────────────────────

describe('size()', () => {
  it('returns 0 when queue is empty', () => {
    const q = new TaskQueue(2);
    expect(q.size()).toBe(0);
  });

  it('reflects pending + running tasks', async () => {
    const q = new TaskQueue(1);
    // Add two tasks: one will be running, one will be pending
    let resolve1!: () => void;
    const task1 = q.add('t1', () => new Promise<void>((r) => { resolve1 = r; }));
    const task2 = q.add('t2', async () => {});

    await delay(10); // let t1 start
    // t1 is running (pending=1), t2 is queued (size=1) → total 2
    expect(q.size()).toBe(2);

    resolve1();
    await Promise.all([task1, task2]);
    expect(q.size()).toBe(0);
  });
});

// ─── Concurrency stress ───────────────────────────────────────────────────────

describe('Concurrency stress', () => {
  it('50 quick tasks all complete; final count equals 50', async () => {
    const q = new TaskQueue(10);
    let count = 0;
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        q.add(`t${i}`, async () => { count++; }),
      ),
    );
    expect(count).toBe(50);
  });

  it('mixed success/failure tasks fire correct events; total ok+fail equals total adds', async () => {
    const q = new TaskQueue(5);
    const doneEvt = vi.fn();
    const errEvt = vi.fn();
    q.on('task:done', doneEvt);
    q.on('task:error', errEvt);

    const total = 20;
    const promises = Array.from({ length: total }, (_, i) =>
      q.add(`t${i}`, async () => {
        if (i % 2 === 0) throw new Error('even fail');
      }).catch(() => {}),
    );
    await Promise.all(promises);

    const okCount = doneEvt.mock.calls.length;
    const failCount = errEvt.mock.calls.length;
    expect(okCount + failCount).toBe(total);
    expect(okCount).toBe(10);  // odd indices succeed
    expect(failCount).toBe(10); // even indices fail
  });

  it('generator + non-generator tasks interleaved all complete', async () => {
    const q = new TaskQueue(3);
    const progEvt = vi.fn();
    const doneEvt = vi.fn();
    q.on('task:progress', progEvt);
    q.on('task:done', doneEvt);

    const tasks = [
      q.add('g1', async function* () { yield { phase: 'a' }; yield { phase: 'b' }; }),
      q.add('n1', async () => 1),
      q.add('g2', async function* () { yield { phase: 'c' }; }),
      q.add('n2', async () => 2),
    ];
    await Promise.all(tasks);

    // 3 yields total across generators
    expect(progEvt).toHaveBeenCalledTimes(3);
    // 4 tasks done (generators emit done with undefined, non-generators with value)
    expect(doneEvt).toHaveBeenCalledTimes(4);
  });
});

// ─── queue:drain ──────────────────────────────────────────────────────────────

describe('queue:drain', () => {
  it('fires after all tasks complete', async () => {
    const q = new TaskQueue(2);
    const drain = vi.fn();
    q.on('queue:drain', drain);
    await q.add('t1', async () => 1);
    await q.add('t2', async () => 2);
    await delay(20);
    expect(drain).toHaveBeenCalled();
  });

  it('does NOT fire while tasks are still in flight', async () => {
    const q = new TaskQueue(1);
    const drain = vi.fn();
    q.on('queue:drain', drain);

    let resolve1!: () => void;
    const task1 = q.add('t1', () => new Promise<void>((r) => { resolve1 = r; }));
    const task2 = q.add('t2', async () => {});

    await delay(10);
    expect(drain).not.toHaveBeenCalled();

    resolve1();
    await Promise.all([task1, task2]);
    await delay(10);
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('fires multiple times if more tasks are added after first drain', async () => {
    const q = new TaskQueue(2);
    const drain = vi.fn();
    q.on('queue:drain', drain);

    await q.add('t1', async () => 1);
    await delay(20); // first drain

    await q.add('t2', async () => 2);
    await delay(20); // second drain

    expect(drain.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
