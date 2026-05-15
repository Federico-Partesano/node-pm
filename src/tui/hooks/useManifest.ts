import { useEffect, useState } from 'react';
import { ManifestStore } from '../../core/manifest.js';
import type { Manifest, Project } from '../../shared/types.js';

export function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const store = new ManifestStore();
    store.load()
      .then((m) => { setManifest(m); setProjects(m.projects); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { manifest, projects, loading, error };
}
