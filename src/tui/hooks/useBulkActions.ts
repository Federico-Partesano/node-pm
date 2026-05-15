import { useMemo } from 'react';
import type { GitOps } from '../../core/git.js';
import type { PackageManager } from '../../core/pm.js';
import type { TaskQueue } from '../../core/queue.js';
import type { Project } from '../../shared/types.js';

type Args = {
  queue: TaskQueue;
  git: GitOps;
  pm: PackageManager;
  selectedProjects: Project[];
  pathByName: Map<string, string>;
  allProjects?: Project[];
  resolvePath?: (p: Project) => string;
};

/**
 * Returns the three bulk handlers the App wires to keypresses.
 * Each enqueues one task per selected project; missing paths are skipped.
 */
export function useBulkActions({ queue, git, pm, selectedProjects, pathByName, allProjects, resolvePath }: Args) {
  return useMemo(() => {
    const forEachWithPath = (label: string, fn: (p: Project, path: string) => Promise<unknown> | AsyncIterable<unknown>) => {
      for (const p of selectedProjects) {
        const path = pathByName.get(p.name);
        if (!path) continue;
        void queue.add(`${label}:${p.name}`, () => fn(p, path) as Promise<unknown>);
      }
    };

    const cloneAll = () => {
      if (!allProjects || !resolvePath) return;
      for (const p of allProjects) {
        const path = resolvePath(p);
        void queue.add(`clone:${p.group}/${p.name}`, () => git.clone(p.url, path));
      }
    };

    return {
      pullSelected: () => forEachWithPath('pull', (_p, path) => git.pull(path)),
      cloneSelected: () => forEachWithPath('clone', (p, path) => git.clone(p.url, path)),
      installSelected: () => forEachWithPath('install', (_p, path) => pm.install(path)),
      cloneAll,
    };
  }, [queue, git, pm, selectedProjects, pathByName, allProjects, resolvePath]);
}
