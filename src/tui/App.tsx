import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { useManifest } from './hooks/useManifest.js';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useQueue } from './hooks/useQueue.js';
import { Groups, type GroupSummary } from './panels/Groups.js';
import { Projects } from './panels/Projects.js';
import { Detail } from './panels/Detail.js';
import { Tasks } from './panels/Tasks.js';
import { Logs, type LogTab } from './panels/Logs.js';
import { GitOps } from '../core/git.js';
import { PackageManager } from '../core/pm.js';
import { TaskQueue } from '../core/queue.js';
import { ScriptRunner } from '../core/runner.js';
import { resolveProjectPath } from '../shared/paths.js';
import type { PMName, Project } from '../shared/types.js';

type Panel = 'groups' | 'projects';

export function App() {
  const { manifest, projects, loading } = useManifest();
  const resolvePath = useMemo(
    () => (p: Project) => manifest ? resolveProjectPath(manifest.root, p) : '',
    [manifest],
  );
  const git = useMemo(() => new GitOps(), []);
  const pm = useMemo(() => new PackageManager(), []);
  const runner = useMemo(() => new ScriptRunner(), []);
  const queue = useMemo(() => new TaskQueue(manifest?.concurrency ?? 5), [manifest?.concurrency]);
  const tasks = useQueue(queue);

  const groupSummaries = useMemo<GroupSummary[]>(() => {
    const map = new Map<string, number>();
    for (const p of projects) map.set(p.group, (map.get(p.group) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>('groups');
  const [pmName, setPmName] = useState<PMName | null>(null);
  const [logs, setLogs] = useState<LogTab[]>([]);
  const [activeLog, setActiveLog] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup && groupSummaries[0]) setActiveGroup(groupSummaries[0].name);
  }, [groupSummaries, activeGroup]);

  const visibleProjects = useMemo(
    () => projects.filter((p) => p.group === activeGroup),
    [projects, activeGroup],
  );
  const paths = useMemo(() => {
    if (!manifest) return [];
    return visibleProjects.map((p) => resolvePath(p));
  }, [visibleProjects, resolvePath, manifest]);
  const statusByPath = useGitStatus(paths);
  const statusByName = useMemo(() => {
    const m = new Map<string, NonNullable<ReturnType<typeof statusByPath.get>>>();
    visibleProjects.forEach((p) => {
      if (!manifest) return;
      const s = statusByPath.get(resolvePath(p));
      if (s) m.set(p.name, s);
    });
    return m;
  }, [statusByPath, visibleProjects, resolvePath, manifest]);

  useEffect(() => {
    if (!cursor && visibleProjects[0]) setCursor(visibleProjects[0].name);
    const cur = visibleProjects.find((p) => p.name === cursor);
    if (!cur || !manifest) return;
    let cancelled = false;
    pm.detect(resolvePath(cur))
      .then((name) => { if (!cancelled) setPmName(name); })
      .catch(() => { if (!cancelled) setPmName(null); });
    return () => { cancelled = true; };
  }, [visibleProjects, cursor, pm, resolvePath, manifest]);

  const { exit } = useApp();
  useInput((input, key) => {
    if (input === 'q') exit();
    if (key.tab) setPanel((p) => (p === 'groups' ? 'projects' : 'groups'));
    if (input === 'a') setSelected(new Set(visibleProjects.map((p) => p.name)));
    if (input === 'A') setSelected(new Set());
    if (!manifest) return;
    if (input === 'p') {
      for (const p of visibleProjects.filter((p) => selected.has(p.name))) {
        void queue.add(`pull:${p.name}`, () => git.pull(resolvePath(p)));
      }
    }
    if (input === 'c') {
      for (const p of visibleProjects.filter((p) => selected.has(p.name))) {
        void queue.add(`clone:${p.name}`, () => git.clone(p.url, resolvePath(p)));
      }
    }
    if (input === 'i') {
      for (const p of visibleProjects.filter((p) => selected.has(p.name))) {
        void queue.add(`install:${p.name}`, () => pm.install(resolvePath(p)));
      }
    }
    if (input === 'r') {
      const cur = visibleProjects.find((p) => p.name === cursor);
      const fav = cur?.scripts?.favorites?.[0];
      if (cur && fav) {
        void runner.spawn(cur, fav, resolvePath(cur)).then((handle) => {
          const tab: LogTab = { id: handle.id, label: `${cur.name}:${fav}`, lines: [] };
          setLogs((prev) => [...prev, tab]);
          setActiveLog(handle.id);
          handle.onStdout((l) => setLogs((prev) => prev.map((t) => t.id === handle.id ? { ...t, lines: [...t.lines, l] } : t)));
          handle.onStderr((l) => setLogs((prev) => prev.map((t) => t.id === handle.id ? { ...t, lines: [...t.lines, `[err] ${l}`] } : t)));
        });
      }
    }
  });

  if (loading) return <Text>loading manifest...</Text>;

  const cur = visibleProjects.find((p) => p.name === cursor) ?? null;

  return (
    <Box flexDirection="column">
      <Box>
        <Box width="20%"><Groups groups={groupSummaries} selected={activeGroup ?? ''} focused={panel === 'groups'} onSelect={(n) => { setActiveGroup(n); setCursor(null); }} /></Box>
        <Box width="45%"><Projects projects={visibleProjects} statusByName={statusByName} selected={selected} cursor={cursor} focused={panel === 'projects'} onCursor={setCursor} onToggle={(n) => setSelected((s) => { const next = new Set(s); if (next.has(n)) next.delete(n); else next.add(n); return next; })} /></Box>
        <Box width="35%"><Detail project={cur} path={cur && manifest ? resolvePath(cur) : null} pmName={pmName} /></Box>
      </Box>
      <Box>
        <Box width="60%"><Tasks tasks={tasks} /></Box>
        <Box width="40%"><Logs tabs={logs} activeId={activeLog} /></Box>
      </Box>
      <Text dimColor>[?]help [tab]panel [space]select [a]all [p]pull [c]clone [i]install [r]run [q]quit</Text>
    </Box>
  );
}
