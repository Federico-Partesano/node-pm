import { useCallback, useEffect, useState } from 'react';
import type { ManifestStore } from '../../core/manifest.js';
import type { Session } from '../../shared/types.js';

export function useSessions(store: ManifestStore) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      store.invalidate();
      const list = (await store.listSessions?.()) ?? [];
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = useCallback(
    async (id: string) => {
      await store.removeSession(id);
      await reload();
    },
    [store, reload],
  );

  return { sessions, loading, reload, remove };
}
