import { useLayoutEffect, useState } from 'react';
import type { TaskQueue } from '../../core/queue.js';
import type { Progress } from '../../shared/types.js';

export type QueueTask = {
  name: string;
  status: 'running' | 'done' | 'error';
  progress?: Progress;
  error?: unknown;
};

export function useQueue(queue: TaskQueue): QueueTask[] {
  const [tasks, setTasks] = useState<QueueTask[]>([]);

  useLayoutEffect(() => {
    const upd = (name: string, patch: Partial<QueueTask>) =>
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.name === name);
        if (idx < 0) return [...prev, { name, status: 'running', ...patch }];
        const next = prev.slice();
        next[idx] = { ...next[idx]!, ...patch };
        return next;
      });

    const onStart = (e: { name: string }) => upd(e.name, { status: 'running' });
    const onProg = (e: { name: string; progress: Progress }) => upd(e.name, { progress: e.progress });
    const onDone = (e: { name: string }) => upd(e.name, { status: 'done' });
    const onErr = (e: { name: string; error: unknown }) => upd(e.name, { status: 'error', error: e.error });

    queue.on('task:start', onStart);
    queue.on('task:progress', onProg);
    queue.on('task:done', onDone);
    queue.on('task:error', onErr);
    return () => {
      queue.off('task:start', onStart);
      queue.off('task:progress', onProg);
      queue.off('task:done', onDone);
      queue.off('task:error', onErr);
    };
  }, [queue]);

  return tasks;
}
