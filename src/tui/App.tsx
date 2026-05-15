import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
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
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useSnapshot } from './hooks/useSnapshot.js';
import { Groups } from './panels/Groups.js';
import { Projects } from './panels/Projects.js';
import { Detail } from './panels/Detail.js';
import { Tasks } from './panels/Tasks.js';
import { Logs } from './panels/Logs.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { EmptyState } from './components/EmptyState.js';
import { OnboardingWizard } from './components/OnboardingWizard.js';
import { AddProjectForm } from './components/AddProjectForm.js';
import { BulkCloneForm, type ParsedEntry } from './components/BulkCloneForm.js';
import { DebugBar } from './components/DebugBar.js';
import { GitOps } from '../core/git.js';
import { PackageManager } from '../core/pm.js';
import { TaskQueue } from '../core/queue.js';
import { ScriptRunner } from '../core/runner.js';
import { getBestRoot, pathExists, resolveProjectPath } from '../shared/paths.js';
import type { GitStatus } from '../shared/types.js';

type EmptyMode = 'wizard' | 'help';

export function App() {
  const { manifest, projects, loading, reload, store } = useManifest();
  const git = useMemo(() => new GitOps(), []);
  const pm = useMemo(() => new PackageManager(), []);
  const runner = useMemo(() => new ScriptRunner(), []);
  const queue = useMemo(() => new TaskQueue(manifest?.concurrency ?? 5), [manifest?.concurrency]);
  const tasks = useQueue(queue);

  const groupSummaries = useGroupSummaries(projects);
  const state = useAppState();
  const { activeGroup, setActiveGroup, cursor, setCursor, selected, panel } = state;
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkClone, setShowBulkClone] = useState(false);
  const [emptyMode, setEmptyMode] = useState<EmptyMode>('wizard');

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
  const resolvePath = useMemo(
    () => (p: { group: string; name: string; url: string }) =>
      manifest ? resolveProjectPath(manifest.root, p as never) : '',
    [manifest],
  );
  const bulk = useBulkActions({
    queue, git, pm, selectedProjects, pathByName,
    allProjects: projects,
    resolvePath,
  });
  const snapshot = useSnapshot(manifest);
  const { cols, rows } = useTerminalSize();

  const isEmpty = projects.length === 0;

  // Empty-state: while showing static help, 's' relaunches wizard, 'n' opens add form.
  useInput((input) => {
    if (!manifest || !isEmpty || showAddForm) return;
    if (emptyMode === 'help') {
      if (input === 's') setEmptyMode('wizard');
      if (input === 'n') setShowAddForm(true);
    }
  });

  useAppKeys({
    enabled: !!manifest && !isEmpty && !showAddForm && !showBulkClone,
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
    onAddProject: () => setShowAddForm(true),
    onCloneAll: () => setShowBulkClone(true),
    onExport: () => { void snapshot.exportSnapshot(); },
  });

  const handleBulkClone = async (entries: ParsedEntry[]) => {
    setShowBulkClone(false);
    for (const e of entries) {
      const project = { name: e.name, group: e.group, url: e.url };
      await store.addProject(project);
      const dest = resolvePath(project);
      void queue.add(`clone:${e.group}/${e.name}`, () => git.clone(e.url, dest));
    }
    await reload();
  };

  if (loading) {
    return (
      <Box width={cols} height={rows} paddingX={2} paddingY={1}>
        <Text color="cyan">Loading manifest…</Text>
      </Box>
    );
  }

  const root = manifest?.root && pathExists(manifest.root) ? manifest.root : getBestRoot();

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header
        root={root}
        totalProjects={projects.length}
        totalGroups={groupSummaries.length}
        activeGroup={activeGroup}
      />

      {isEmpty ? (
        showAddForm ? (
          <AddProjectForm
            onDone={() => { setShowAddForm(false); void reload(); }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : emptyMode === 'wizard' ? (
          <OnboardingWizard
            initialRoot={root}
            onComplete={() => { void reload(); }}
            onCancel={() => setEmptyMode('help')}
          />
        ) : (
          <EmptyState root={root} />
        )
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexGrow={2} flexBasis={0}>
            <Box flexGrow={1} flexBasis={0} minWidth={18}>
              <Groups
                groups={groupSummaries}
                selected={activeGroup ?? ''}
                focused={panel === 'groups'}
                onSelect={(n) => { setActiveGroup(n); setCursor(null); }}
              />
            </Box>
            <Box flexGrow={2} flexBasis={0} minWidth={32}>
              <Projects
                projects={visible}
                statusByName={statusByName}
                selected={selected}
                cursor={cursor}
                focused={panel === 'projects'}
                onCursor={setCursor}
                onToggle={state.toggleSelected}
              />
            </Box>
            <Box flexGrow={2} flexBasis={0} minWidth={32}>
              <Detail project={cur} path={curPath} pmName={pmName} />
            </Box>
          </Box>
          <Box flexGrow={1} flexBasis={0}>
            <Box flexGrow={3} flexBasis={0}>
              <Tasks tasks={tasks} />
            </Box>
            <Box flexGrow={2} flexBasis={0}>
              <Logs tabs={logs} activeId={activeLog} />
            </Box>
          </Box>
          {showAddForm && (
            <AddProjectForm
              onDone={() => { setShowAddForm(false); void reload(); }}
              onCancel={() => setShowAddForm(false)}
            />
          )}
          {showBulkClone && (
            <BulkCloneForm
              defaultGroup={activeGroup ?? 'OSS'}
              onSubmit={(entries) => { void handleBulkClone(entries); }}
              onCancel={() => setShowBulkClone(false)}
            />
          )}
        </Box>
      )}

      {snapshot.last && (
        <Box paddingX={2}>
          {snapshot.last.ok ? (
            <Text color="green">✓ Snapshot exported to {snapshot.last.path}</Text>
          ) : (
            <Text color="red">✗ Export failed: {snapshot.last.error}</Text>
          )}
        </Box>
      )}
      <Footer />
      <DebugBar />
    </Box>
  );
}
