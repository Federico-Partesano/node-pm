import { useMemo } from 'react';
import { resolveProjectPath } from '../../shared/paths.js';
import type { Manifest, Project } from '../../shared/types.js';

export type VisibleProjects = {
  visible: Project[];
  paths: string[];
  pathByName: Map<string, string>;
};

/**
 * Filters projects to the active group and resolves their on-disk paths once
 * per (projects, activeGroup, manifest) tuple. Returns the filtered list, the
 * paths array (useful for hooks that take path[]), and a name→path lookup.
 */
export function useVisibleProjects(
  projects: Project[],
  activeGroup: string | null,
  manifest: Manifest | null,
): VisibleProjects {
  return useMemo<VisibleProjects>(() => {
    const visible = projects.filter((p) => p.group === activeGroup);
    if (!manifest) {
      return { visible, paths: [], pathByName: new Map() };
    }
    const pathByName = new Map<string, string>();
    const paths: string[] = [];
    for (const p of visible) {
      const path = resolveProjectPath(manifest.root, p);
      pathByName.set(p.name, path);
      paths.push(path);
    }
    return { visible, paths, pathByName };
  }, [projects, activeGroup, manifest]);
}
