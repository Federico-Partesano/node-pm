import { useCallback } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import { GitOps } from '../../core/git.js';
import { PackageManager } from '../../core/pm.js';
import type { ManifestStore } from '../../core/manifest.js';
import type { Project } from '../../shared/types.js';
import type { QuickActionId } from '../config/quickActions.js';

export type ActionResult = { ok: boolean; message: string };

type Args = {
  git: GitOps;
  pm: PackageManager;
  store: ManifestStore;
  reload: () => Promise<void>;
};

async function readScripts(projectPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.scripts && typeof parsed.scripts === 'object') {
      return Object.keys(parsed.scripts);
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function useQuickActions({ git, pm, store, reload }: Args) {
  const loadBranches = useCallback(
    async (projectPath: string) => {
      await git.fetchAll(projectPath).catch(() => {});
      const { local, remote, current } = await git.listBranches(projectPath);
      // Dedupe: prefer local names; show remote-only branches with "origin/" prefix.
      const localSet = new Set(local);
      const remoteOnly = remote.filter((r) => {
        const short = r.replace(/^[^/]+\//, '');
        return !localSet.has(short);
      });
      return { branches: [...local, ...remoteOnly], current };
    },
    [git],
  );

  const loadScripts = useCallback(async (projectPath: string) => {
    return readScripts(projectPath);
  }, []);

  const runAction = useCallback(
    async (
      id: QuickActionId,
      project: Project,
      projectPath: string | null,
      payload?: { branch?: string; script?: string },
    ): Promise<ActionResult> => {
      if (!projectPath && id !== 'remove') {
        return { ok: false, message: 'Path missing on disk' };
      }
      try {
        switch (id) {
          case 'pull': {
            const r = await git.pull(projectPath!);
            return {
              ok: true,
              message: `Pulled · ${r.changes} change(s), +${r.insertions}/-${r.deletions}`,
            };
          }
          case 'fetch':
            await git.fetchAll(projectPath!);
            return { ok: true, message: 'fetch --all --prune done' };
          case 'install': {
            const pmName = (await pm.detect(projectPath!)) ?? 'npm';
            for await (const _ of pm.install(projectPath!)) void _;
            return { ok: true, message: `${pmName} install done` };
          }
          case 'switchBranch': {
            if (!payload?.branch) return { ok: false, message: 'No branch chosen' };
            const branch = payload.branch.replace(/^origin\//, '');
            await git.checkoutBranch(projectPath!, branch);
            return { ok: true, message: `checked out ${branch}` };
          }
          case 'runScript': {
            if (!payload?.script) return { ok: false, message: 'No script chosen' };
            const pmName = (await pm.detect(projectPath!)) ?? 'npm';
            const res = await execa(pmName, ['run', payload.script], { cwd: projectPath!, reject: false, timeout: 180_000 });
            return {
              ok: res.exitCode === 0,
              message: `${pmName} run ${payload.script} → exit ${res.exitCode}`,
            };
          }
          case 'snapshotThis':
            return {
              ok: false,
              message: 'Use Home → Snapshot create and pick this project (TODO inline)',
            };
          case 'copyPath':
            return { ok: true, message: projectPath! };
          case 'openShell':
            return { ok: false, message: 'TUI cannot open a shell — copy the path instead' };
          case 'remove': {
            await store.removeProject(project.name, project.group);
            await reload();
            return { ok: true, message: `removed ${project.group}/${project.name} from manifest` };
          }
          default:
            return { ok: false, message: `Unknown action: ${id}` };
        }
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },
    [git, pm, store, reload],
  );

  return { loadBranches, loadScripts, runAction };
}
