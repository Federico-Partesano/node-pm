import { useCallback, useEffect, useMemo, useState } from 'react';
import { ManifestStore } from '../../core/manifest.js';
import type { Manifest, Project } from '../../shared/types.js';

export function useManifest() {
  const store = useMemo(() => new ManifestStore(), []);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      store.invalidate();
      const m = await store.load();
      setManifest(m);
      setProjects(m.projects);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { void reload(); }, [reload]);

  return { manifest, projects, loading, error, reload, store };
}
