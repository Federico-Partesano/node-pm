import { ManifestStore } from '../core/manifest.js';
import { TaskQueue } from '../core/queue.js';
import { selectProjects, type Selector } from './bulk.js';
import { resolveProjectPath } from '../shared/paths.js';
import type { Progress, Project } from '../shared/types.js';

export type BulkOptions = Selector & { label: string };

export type BulkTask<T> = (
  project: Project,
  projectPath: string,
) => Promise<T> | AsyncIterable<Progress>;

/**
 * Shared scaffolding for bulk CLI commands (clone/pull/install): load manifest,
 * resolve targets via the standard --all/--group/[names] selector, run the task
 * for each target through a TaskQueue, and print a final ok/fail summary.
 *
 * Sets process.exitCode = 1 when no targets matched, 2 when any task failed.
 */
export async function runBulk<T>(opts: BulkOptions, task: BulkTask<T>): Promise<void> {
  const store = new ManifestStore();
  const m = await store.load();
  const targets = await selectProjects(store, opts);
  if (targets.length === 0) {
    console.error('No projects matched');
    process.exitCode = 1;
    return;
  }
  const queue = new TaskQueue(m.concurrency);
  let ok = 0;
  let fail = 0;
  queue.on('task:done', () => ok++);
  queue.on('task:error', () => fail++);
  // Per-task catch: TaskQueue re-throws on failure but we still want the summary
  // to print and the exit code to reflect the mix instead of bailing on first error.
  await Promise.all(
    targets.map((p) =>
      queue
        .add(`${opts.label}:${p.name}`, () => task(p, resolveProjectPath(m.root, p)))
        .catch(() => {}),
    ),
  );
  console.log(`${opts.label} done: ${ok} ok, ${fail} failed`);
  if (fail > 0) process.exitCode = 2;
}
