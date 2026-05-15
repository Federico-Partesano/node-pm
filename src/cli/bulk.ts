import type { ManifestStore } from '../core/manifest.js';
import type { Project } from '../shared/types.js';

export type Selector = { all?: boolean; group?: string; names?: string[] };

export async function selectProjects(store: ManifestStore, sel: Selector): Promise<Project[]> {
  const list = await store.list({ group: sel.group });
  if (sel.all) return list;
  if (sel.names && sel.names.length > 0) {
    return list.filter((p) => sel.names!.includes(p.name));
  }
  return [];
}
