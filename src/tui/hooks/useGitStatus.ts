import { useLayoutEffect, useState } from 'react';
import { GitOps } from '../../core/git.js';
import type { GitStatus } from '../../shared/types.js';

export function useGitStatus(paths: string[], refreshMs = 30000): Map<string, GitStatus> {
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map());
  const key = JSON.stringify(paths);

  useLayoutEffect(() => {
    const git = new GitOps();
    let alive = true;

    async function refresh() {
      const fresh = new Map<string, GitStatus>();
      for (const p of paths) {
        if (!alive) return;
        try {
          fresh.set(p, await git.status(p));
        } catch {
          // skip
        }
      }
      if (alive) setStatuses(fresh);
    }

    void refresh();
    const interval = setInterval(refresh, refreshMs);
    return () => { alive = false; clearInterval(interval); };
  }, [key, refreshMs]);

  return statuses;
}
