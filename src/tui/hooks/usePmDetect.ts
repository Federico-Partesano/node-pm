import { useEffect, useState } from 'react';
import type { PackageManager } from '../../core/pm.js';
import type { PMName } from '../../shared/types.js';

/**
 * Detects the package manager for the focused project's path.
 * Cancels stale results when the path changes mid-detect.
 */
export function usePmDetect(projectPath: string | null, pm: PackageManager): PMName | null {
  const [pmName, setPmName] = useState<PMName | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setPmName(null);
      return;
    }
    let cancelled = false;
    pm.detect(projectPath)
      .then((name) => { if (!cancelled) setPmName(name); })
      .catch(() => { if (!cancelled) setPmName(null); });
    return () => { cancelled = true; };
  }, [projectPath, pm]);

  return pmName;
}
