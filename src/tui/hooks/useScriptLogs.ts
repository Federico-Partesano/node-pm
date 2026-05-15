import { useCallback, useState } from 'react';
import type { ScriptRunner } from '../../core/runner.js';
import type { Project } from '../../shared/types.js';
import type { LogTab } from '../panels/Logs.js';

/**
 * Owns the log tabs for scripts the user has launched. runScript creates a tab
 * for the spawned handle, focuses it, and streams stdout/stderr into its lines.
 */
export function useScriptLogs(runner: ScriptRunner) {
  const [logs, setLogs] = useState<LogTab[]>([]);
  const [activeLog, setActiveLog] = useState<string | null>(null);

  const runScript = useCallback(
    async (project: Project, scriptName: string, projectPath: string) => {
      const handle = await runner.spawn(project, scriptName, projectPath);
      const tab: LogTab = { id: handle.id, label: `${project.name}:${scriptName}`, lines: [] };
      setLogs((prev) => [...prev, tab]);
      setActiveLog(handle.id);
      const append = (line: string) =>
        setLogs((prev) =>
          prev.map((t) => (t.id === handle.id ? { ...t, lines: [...t.lines, line] } : t)),
        );
      handle.onStdout((l) => append(l));
      handle.onStderr((l) => append(`[err] ${l}`));
      return handle;
    },
    [runner],
  );

  return { logs, activeLog, runScript };
}
