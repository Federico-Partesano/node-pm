import { useLayoutEffect, useState } from 'react';
import { GitOps } from '../../core/git.js';
import type { GitStatus } from '../../shared/types.js';

export function useGitStatus(paths: string[], refreshMs = 30000): Map<string, GitStatus> {
  const [statuses, setStatuses] = useState<Map<string, GitStatus>>(new Map());

  useLayoutEffect(() => {
    const git = new GitOps();
    let alive = true;

    async function refresh() {
      for (const p of paths) {
        if (!alive) return;
        try {
          const s = await git.status(p);
          if (!alive) return;
          setStatuses((prev) => new Map(prev).set(p, s));
        } catch {
          // leave previous status; do not crash UI
        }
      }
    }

    void refresh();
    const interval = setInterval(refresh, refreshMs);
    return () => { alive = false; clearInterval(interval); };
  }, [paths.join('|'), refreshMs]);

  return statuses;
}
