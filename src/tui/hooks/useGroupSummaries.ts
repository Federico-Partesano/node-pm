import { useMemo } from 'react';
import type { GroupSummary } from '../panels/Groups.js';
import type { Project } from '../../shared/types.js';

/**
 * Returns one summary per group, sorted alphabetically by name.
 */
export function useGroupSummaries(projects: Project[]): GroupSummary[] {
  return useMemo<GroupSummary[]>(() => {
    const counts = new Map<string, number>();
    for (const p of projects) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);
}
