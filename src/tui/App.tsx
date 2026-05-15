import React, { useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useManifest } from './hooks/useManifest.js';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useQueue } from './hooks/useQueue.js';
import { useAppState } from './hooks/useAppState.js';
import { useGroupSummaries } from './hooks/useGroupSummaries.js';
import { useVisibleProjects } from './hooks/useVisibleProjects.js';
import { usePmDetect } from './hooks/usePmDetect.js';
import { useScriptLogs } from './hooks/useScriptLogs.js';
import { useBulkActions } from './hooks/useBulkActions.js';
import { useAppKeys } from './hooks/useAppKeys.js';
import { Groups } from './panels/Groups.js';
import { Projects } from './panels/Projects.js';
import { Detail } from './panels/Detail.js';
import { Tasks } from './panels/Tasks.js';
import { Logs } from './panels/Logs.js';
import { GitOps } from '../core/git.js';
import { PackageManager } from '../core/pm.js';
import { TaskQueue } from '../core/queue.js';
import { ScriptRunner } from '../core/runner.js';
import type { GitStatus } from '../shared/types.js';

export function App() {
  const { manifest, projects, loading } = useManifest();
  const git = useMemo(() => new GitOps(), []);
  const pm = useMemo(() => new PackageManager(), []);
  const runner = useMemo(() => new ScriptRunner(), []);
  const queue = useMemo(() => new TaskQueue(manifest?.concurrency ?? 5), [manifest?.concurrency]);
  const tasks = useQueue(queue);

  const groupSummaries = useGroupSummaries(projects);
  const state = useAppState();
  const { activeGroup, setActiveGroup, cursor, setCursor, selected, panel } = state;

  useEffect(() => {
    if (!activeGroup && groupSummaries[0]) setActiveGroup(groupSummaries[0].name);
  }, [groupSummaries, activeGroup, setActiveGroup]);

  const { visible, paths, pathByName } = useVisibleProjects(projects, activeGroup, manifest);
  const statusByPath = useGitStatus(paths);
  const statusByName = useMemo(() => {
    const m = new Map<string, GitStatus>();
    for (const p of visible) {
      const s = statusByPath.get(pathByName.get(p.name) ?? '');
      if (s) m.set(p.name, s);
    }
    return m;
  }, [statusByPath, visible, pathByName]);

  useEffect(() => {
    if (!cursor && visible[0]) setCursor(visible[0].name);
  }, [visible, cursor, setCursor]);

  const cur = visible.find((p) => p.name === cursor) ?? null;
  const curPath = cur ? pathByName.get(cur.name) ?? null : null;
  const pmName = usePmDetect(curPath, pm);

  const { logs, activeLog, runScript } = useScriptLogs(runner);
  const selectedProjects = visible.filter((p) => selected.has(p.name));
  const bulk = useBulkActions({ queue, git, pm, selectedProjects, pathByName });

  useAppKeys({
    enabled: !!manifest,
    onTab: state.nextPanel,
    onSelectAll: () => state.selectAll(visible.map((p) => p.name)),
    onClearSelection: state.clearSelection,
    onPull: bulk.pullSelected,
    onClone: bulk.cloneSelected,
    onInstall: bulk.installSelected,
    onRun: () => {
      const fav = cur?.scripts?.favorites?.[0];
      if (cur && fav && curPath) void runScript(cur, fav, curPath);
    },
  });

  if (loading) return <Text>loading manifest...</Text>;

  return (
    <Box flexDirection="column">
      <Box>
        <Box width="20%"><Groups groups={groupSummaries} selected={activeGroup ?? ''} focused={panel === 'groups'} onSelect={(n) => { setActiveGroup(n); setCursor(null); }} /></Box>
        <Box width="45%"><Projects projects={visible} statusByName={statusByName} selected={selected} cursor={cursor} focused={panel === 'projects'} onCursor={setCursor} onToggle={state.toggleSelected} /></Box>
        <Box width="35%"><Detail project={cur} path={curPath} pmName={pmName} /></Box>
      </Box>
      <Box>
        <Box width="60%"><Tasks tasks={tasks} /></Box>
        <Box width="40%"><Logs tabs={logs} activeId={activeLog} /></Box>
      </Box>
      <Text dimColor>[?]help [tab]panel [space]select [a]all [p]pull [c]clone [i]install [r]run [q]quit</Text>
    </Box>
  );
}
