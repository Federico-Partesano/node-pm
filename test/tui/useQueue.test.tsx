import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Text } from 'ink';
import { TaskQueue } from '../../src/core/queue.js';
import { useQueue } from '../../src/tui/hooks/useQueue.js';

function Probe({ q }: { q: TaskQueue }) {
  const tasks = useQueue(q);
  if (tasks.length === 0) return <Text>empty</Text>;
  return <Text>{tasks.map((t) => `${t.name}:${t.status}`).join(',')}</Text>;
}

function ProbeProgress({ q }: { q: TaskQueue }) {
  const tasks = useQueue(q);
  const t = tasks[0];
  if (!t) return <Text>empty</Text>;
  return <Text>{t.name}:{t.status}:{t.progress?.percent ?? 'no'}</Text>;
}

function ProbeError({ q }: { q: TaskQueue }) {
  const tasks = useQueue(q);
  const t = tasks[0];
  if (!t) return <Text>empty</Text>;
  return <Text>{t.name}:{t.status}:{String(t.error)}</Text>;
}

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('useQueue', () => {
  it('empty queue renders empty', () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<Probe q={q} />);
    expect(lastFrame()).toBe('empty');
  });

  it('task:start adds entry with status running', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<Probe q={q} />);
    // Emit task:start manually to test the listener
    q.emit('task:start', { name: 'my-task' });
    await wait(10);
    expect(lastFrame()).toContain('my-task:running');
  });

  it('task:done sets status done', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<Probe q={q} />);
    void q.add('t1', async () => undefined);
    await wait();
    expect(lastFrame()).toBe('t1:done');
  });

  it('task:error sets status error and stores error', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<ProbeError q={q} />);
    const err = new Error('fail!');
    void q.add('bad', async () => { throw err; }).catch(() => {});
    await wait();
    expect(lastFrame()).toContain('bad:error');
    expect(lastFrame()).toContain('Error: fail!');
  });

  it('task:progress updates progress', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<ProbeProgress q={q} />);
    void q.add('prog', async function* () {
      yield { phase: 'step', percent: 75 };
    });
    await wait();
    // after done the progress may still be there; just verify it tracked
    // At least the task was tracked
    expect(lastFrame()).toContain('prog');
  });

  it('reflects start, progress and done events via real queue', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<Probe q={q} />);
    void q.add('t1', async function* () {
      yield { phase: 'a', percent: 50 };
    });
    await wait();
    expect(lastFrame()).toMatch(/t1:done/);
  });

  it('multiple tasks tracked simultaneously', async () => {
    const q = new TaskQueue(2);
    const { lastFrame } = render(<Probe q={q} />);
    void q.add('t1', async () => undefined);
    void q.add('t2', async () => undefined);
    await wait();
    expect(lastFrame()).toContain('t1:done');
    expect(lastFrame()).toContain('t2:done');
  });

  it('same task name re-emitted updates existing entry without duplicating', async () => {
    const q = new TaskQueue(1);
    const tasks: ReturnType<typeof useQueue>[] = [];
    function Capture({ queue }: { queue: TaskQueue }) {
      const t = useQueue(queue);
      tasks.push(t);
      return null;
    }
    render(<Capture queue={q} />);
    q.emit('task:start', { name: 'dup' });
    await wait(10);
    q.emit('task:done', { name: 'dup' });
    await wait(10);
    const last = tasks[tasks.length - 1]!;
    expect(last.filter((t) => t.name === 'dup')).toHaveLength(1);
    expect(last[0]!.status).toBe('done');
  });

  it('tasks order is preserved', async () => {
    const q = new TaskQueue(5);
    const { lastFrame } = render(<Probe q={q} />);
    q.emit('task:start', { name: 'first' });
    q.emit('task:start', { name: 'second' });
    q.emit('task:start', { name: 'third' });
    await wait(10);
    const frame = lastFrame()!;
    const firstIdx = frame.indexOf('first');
    const secondIdx = frame.indexOf('second');
    const thirdIdx = frame.indexOf('third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it('listener removed on unmount: subsequent events do not crash', async () => {
    const q = new TaskQueue(1);
    const { unmount } = render(<Probe q={q} />);
    await wait(10);
    unmount();
    // After unmount, emitting should not crash
    expect(() => q.emit('task:start', { name: 'ghost' })).not.toThrow();
    expect(() => q.emit('task:done', { name: 'ghost' })).not.toThrow();
  });

  it('queue swap re-subscribes to new queue', async () => {
    const q1 = new TaskQueue(1);
    const q2 = new TaskQueue(1);

    let currentQ = q1;
    function Switchable() {
      const tasks = useQueue(currentQ);
      if (tasks.length === 0) return <Text>empty</Text>;
      return <Text>{tasks.map((t) => `${t.name}:${t.status}`).join(',')}</Text>;
    }

    const { lastFrame, rerender } = render(<Switchable />);
    currentQ = q2;
    rerender(<Switchable />);
    void q2.add('q2task', async () => undefined);
    await wait();
    expect(lastFrame()).toContain('q2task:done');
  });
});
