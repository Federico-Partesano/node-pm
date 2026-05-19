import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSnapshotRun } from './hooks/useSnapshotRun.js';
import { usePage } from './hooks/usePage.js';
import { HomePage, type HomeAction } from './pages/HomePage.js';
import { MainPage } from './pages/MainPage.js';
import { WizardPage } from './pages/WizardPage.js';
import { AddProjectPage } from './pages/AddProjectPage.js';
import { BulkClonePage } from './pages/BulkClonePage.js';
import { HelpPage } from './pages/HelpPage.js';
import { SnapshotPage } from './pages/SnapshotPage.js';
import { SnapshotPickerPage } from './pages/SnapshotPickerPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { GitOps } from '../core/git.js';
import { PackageManager } from '../core/pm.js';
import { TaskQueue } from '../core/queue.js';
import { ScriptRunner } from '../core/runner.js';
import { scanForSnapshots } from '../core/snapshot-scanner.js';
import { openZipBlobStoreReader } from '../core/blob-store.js';
import { SnapshotEngine, type SnapshotEvent } from '../core/snapshot.js';
import { getBestRoot, pathExists, resolveProjectPath, expandHome, getDefaultSnapshotDir } from '../shared/paths.js';
import { SnapshotSchema, type GitStatus, type Project } from '../shared/types.js';
import type { ParsedEntry } from './components/BulkCloneForm.js';
import fs from 'node:fs/promises';
import path from 'node:path';

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

  const isEmpty = projects.length === 0;
  const page = usePage('home');

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
  const selectedProjects = useMemo(
    () => visible.filter((p) => selected.has(p.name)),
    [visible, selected],
  );
  const resolvePath = useCallback(
    (p: Project) => (manifest ? resolveProjectPath(manifest.root, p) : ''),
    [manifest],
  );
  const bulk = useBulkActions({
    queue, git, pm, selectedProjects, pathByName,
    allProjects: projects,
    resolvePath,
  });
  const snapshot = useSnapshot(manifest);
  const snapRun = useSnapshotRun(manifest);
  const [snapEvents, setSnapEvents] = useState<AsyncIterable<SnapshotEvent> | null>(null);
  const [snapMode, setSnapMode] = useState<'create' | 'restore'>('create');
  const [snapProjects, setSnapProjects] = useState<Project[]>([]);
  const { cols, rows } = useTerminalSize();

  // Stable callbacks for keys
  const onTab = useCallback(() => state.nextPanel(), [state]);
  const onSelectAll = useCallback(
    () => state.selectAll(visible.map((p) => p.name)),
    [state, visible],
  );
  const onClearSelection = useCallback(() => state.clearSelection(), [state]);
  const onPull = useCallback(() => bulk.pullSelected(), [bulk]);
  const onClone = useCallback(() => bulk.cloneSelected(), [bulk]);
  const onInstall = useCallback(() => bulk.installSelected(), [bulk]);
  const onRun = useCallback(() => {
    const fav = cur?.scripts?.favorites?.[0];
    if (cur && fav && curPath) void runScript(cur, fav, curPath);
  }, [cur, curPath, runScript]);
  const onAddProject = useCallback(() => page.goto('addProject'), [page]);
  const onCloneAll = useCallback(
    () => page.goto('bulkClone', { defaultGroup: activeGroup ?? 'OSS' }),
    [page, activeGroup],
  );
  const onExport = useCallback(() => { void snapshot.exportSnapshot(); }, [snapshot]);

  // Esc on main page returns to home menu
  useInput((_input, key) => {
    if (key.escape && page.current.id === 'main') page.reset('home');
  });

  useAppKeys({
    enabled: !!manifest && page.current.id === 'main',
    onTab,
    onSelectAll,
    onClearSelection,
    onPull,
    onClone,
    onInstall,
    onRun,
    onAddProject,
    onCloneAll,
    onExport,
  });

  const onSelectGroup = useCallback(
    (n: string) => { setActiveGroup(n); setCursor(null); },
    [setActiveGroup, setCursor],
  );

  const handleHomeSelect = useCallback((action: HomeAction) => {
    if (action === 'projects') page.goto('main');
    else if (action === 'bulkClone') page.goto('bulkClone', { defaultGroup: activeGroup ?? 'OSS' });
    else if (action === 'addProject') page.goto('addProject');
    else if (action === 'wizard') page.goto('wizard');
    else if (action === 'export') void snapshot.exportSnapshot();
    else if (action === 'snapshotCreate') {
      if (!manifest || projects.length === 0) return;
      page.goto('snapshotPicker');
    }
    else if (action === 'snapshotRestore') {
      if (!manifest || !snapRun.engine) return;
      const dir = expandHome(manifest.snapshotDir ?? getDefaultSnapshotDir());
      void scanForSnapshots(dir).then(async (files) => {
        files.sort((a, b) => (a < b ? 1 : -1));
        if (files.length === 0) return;
        const target = files[0];
        const reader = await openZipBlobStoreReader(target);
        const snap = SnapshotSchema.parse(JSON.parse(await reader.readMetadata('snapshot.json')));
        const restoreEngine = new SnapshotEngine({
          git: new GitOps(),
          openWriter: () => Promise.reject(new Error('writer not used on restore')),
          openReader: () => Promise.resolve(reader),
          resolveProjectPath: (_r, p) => path.join(expandHome(manifest.root), p.group, p.name),
          destExists: async (p) => !!(await fs.stat(p).catch(() => null)),
          removeDest: async (p) => fs.rm(p, { recursive: true, force: true }),
        });
        const shallowProjects = snap.projects.map((p) => ({ name: p.name, group: p.group, url: p.url }));
        setSnapMode('restore');
        setSnapProjects(shallowProjects);
        setSnapEvents(restoreEngine.restore({
          snapshot: snap,
          snapshotPath: target,
          rootDir: manifest.root,
          onConflict: async () => 'overwrite',
        }));
        page.goto('snapshot');
      });
    }
    else if (action === 'settings') page.goto('settings');
  }, [page, activeGroup, snapshot, manifest, projects, snapRun]);

  const handleBulkClone = useCallback(async (entries: ParsedEntry[]) => {
    page.reset('home');
    for (const e of entries) {
      const project = { name: e.name, group: e.group, url: e.url };
      await store.addProject(project);
      const dest = resolvePath(project);
      void queue.add(`clone:${e.group}/${e.name}`, () => git.clone(e.url, dest));
    }
    await reload();
  }, [page, store, queue, git, resolvePath, reload]);

  if (loading) {
    return (
      <Box width={cols} height={rows} paddingX={2} paddingY={1}>
        <Text color="cyan">Loading manifest…</Text>
      </Box>
    );
  }

  const root = manifest?.root && pathExists(manifest.root) ? manifest.root : getBestRoot();

  // Render exactly one page
  switch (page.current.id) {
    case 'home':
      return (
        <HomePage
          width={cols}
          height={rows}
          root={root}
          totalProjects={projects.length}
          totalGroups={groupSummaries.length}
          hasManifest={!!manifest && !isEmpty}
          onSelect={handleHomeSelect}
        />
      );
    case 'wizard':
      return (
        <WizardPage
          width={cols}
          height={rows}
          initialRoot={root}
          onComplete={() => { page.reset('home'); void reload(); }}
          onCancel={() => page.reset('home')}
        />
      );
    case 'addProject':
      return (
        <AddProjectPage
          width={cols}
          height={rows}
          onDone={() => { page.reset('home'); void reload(); }}
          onCancel={() => page.reset('home')}
        />
      );
    case 'bulkClone':
      return (
        <BulkClonePage
          width={cols}
          height={rows}
          defaultGroup={(page.current.data?.defaultGroup as string) ?? 'OSS'}
          onSubmit={handleBulkClone}
          onCancel={() => page.reset('home')}
        />
      );
    case 'emptyHelp':
      return (
        <HelpPage
          width={cols}
          height={rows}
          root={root}
          onScan={() => page.replace('wizard')}
          onAddProject={() => page.goto('addProject')}
        />
      );
    case 'snapshotPicker':
      return (
        <SnapshotPickerPage
          width={cols}
          height={rows}
          projects={projects}
          title="Select projects to snapshot"
          onCancel={() => page.reset('home')}
          onConfirm={(chosen) => {
            void snapRun.startCreate(chosen).then(({ iterable }) => {
              setSnapMode('create');
              setSnapProjects(chosen);
              setSnapEvents(iterable);
              page.replace('snapshot');
            });
          }}
        />
      );
    case 'snapshot':
      if (!snapEvents) {
        return (
          <Box flexDirection="column" width={cols} height={rows} paddingX={2} paddingY={1}>
            <Text color="yellow">No snapshot in progress.</Text>
            <Text dimColor>Esc to return.</Text>
          </Box>
        );
      }
      return (
        <SnapshotPage
          width={cols}
          height={rows}
          mode={snapMode}
          projects={snapProjects}
          events={snapEvents}
          onExit={() => { setSnapEvents(null); page.reset('home'); void reload(); }}
          onRescan={() => { setSnapEvents(null); page.reset('wizard'); }}
        />
      );
    case 'settings':
      return (
        <SettingsPage
          width={cols}
          height={rows}
          initialSnapshotDir={manifest?.snapshotDir}
          onExit={() => { page.reset('home'); void reload(); }}
        />
      );
    case 'main':
    default:
      return (
        <MainPage
          width={cols}
          height={rows}
          root={root}
          totalProjects={projects.length}
          totalGroups={groupSummaries.length}
          activeGroup={activeGroup}
          groupSummaries={groupSummaries}
          panel={panel}
          onSelectGroup={onSelectGroup}
          visible={visible}
          statusByName={statusByName}
          selected={selected}
          cursor={cursor}
          onCursor={setCursor}
          onToggle={state.toggleSelected}
          cur={cur}
          curPath={curPath}
          pmName={pmName}
          tasks={tasks}
          logs={logs}
          activeLog={activeLog}
          snapshotResult={snapshot.last}
        />
      );
  }
}
