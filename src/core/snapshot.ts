import path from 'node:path';
import type {
  Project,
  Snapshot,
  ProjectSnapshot,
  BlobRef,
} from '../shared/types.js';
import type { GitOps } from './git.js';
import type { BlobStoreWriter, BlobStoreReader } from './blob-store.js';
import { SnapshotError } from '../shared/errors.js';

export type SnapshotPhase =
  | 'diff' | 'untracked' | 'gitignored' | 'stash' | 'finalizing'
  | 'clone' | 'checkout' | 'reset' | 'apply-diff' | 'write-files' | 'apply-stash';

export type SnapshotEvent =
  | { kind: 'project-start'; project: Project }
  | { kind: 'phase'; project: Project; phase: SnapshotPhase }
  | { kind: 'file-progress'; project: Project; current: number; total: number; path: string }
  | { kind: 'log'; level: 'info' | 'warn'; project?: Project; message: string }
  | { kind: 'project-done'; project: Project; bytes: number; warnings: number }
  | { kind: 'project-error'; project: Project; error: string }
  | { kind: 'done'; snapshot: Snapshot; path: string };

export type RestoreConflictDecision = 'skip' | 'overwrite' | 'abort';

export type CreateInput = {
  projects: Project[];
  rootDir: string;
  snapshotPath: string;
  label?: string;
};

export type RestoreInput = {
  snapshot: Snapshot;
  snapshotPath: string;
  rootDir: string;
  onConflict: (project: Project) => Promise<RestoreConflictDecision>;
};

export type SnapshotDeps = {
  git: Pick<
    GitOps,
    | 'headSha'
    | 'currentBranch'
    | 'diffHead'
    | 'listUntracked'
    | 'listIgnored'
    | 'listStashes'
    | 'stashPatch'
  > &
    Partial<
      Pick<
        GitOps,
        | 'clone'
        | 'resetHard'
        | 'applyDiff'
        | 'applyStashPatch'
        | 'checkoutBranch'
        | 'lsRemoteHas'
      >
    >;
  openWriter: (snapshotPath: string) => Promise<BlobStoreWriter>;
  openReader?: (snapshotPath: string) => Promise<BlobStoreReader>;
  resolveProjectPath: (rootDir: string, p: Project) => string;
  destExists?: (absPath: string) => Promise<boolean>;
  removeDest?: (absPath: string) => Promise<void>;
};

export class SnapshotEngine {
  constructor(private deps: SnapshotDeps) {}

  async *create(input: CreateInput): AsyncGenerator<SnapshotEvent, void, void> {
    const writer = await this.deps.openWriter(input.snapshotPath);
    const collected: ProjectSnapshot[] = [];

    for (const project of input.projects) {
      yield { kind: 'project-start', project };
      const repo = this.deps.resolveProjectPath(input.rootDir, project);
      const warnings: string[] = [];
      let bytes = 0;

      try {
        yield { kind: 'phase', project, phase: 'diff' };
        const [head, branch, trackedDiff] = await Promise.all([
          this.deps.git.headSha(repo),
          this.deps.git.currentBranch(repo),
          this.deps.git.diffHead(repo),
        ]);
        yield {
          kind: 'log',
          level: 'info',
          project,
          message: `diff HEAD (${trackedDiff.length} bytes)`,
        };

        yield { kind: 'phase', project, phase: 'untracked' };
        const untrackedList = await this.deps.git.listUntracked(repo);
        const untrackedRefs: BlobRef[] = [];
        for (let i = 0; i < untrackedList.length; i++) {
          const rel = untrackedList[i];
          yield {
            kind: 'file-progress',
            project,
            current: i + 1,
            total: untrackedList.length,
            path: rel,
          };
          try {
            untrackedRefs.push(
              await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }),
            );
          } catch (err) {
            const msg = `skip ${rel}: ${(err as Error).message}`;
            warnings.push(msg);
            yield { kind: 'log', level: 'warn', project, message: msg };
          }
        }

        yield { kind: 'phase', project, phase: 'gitignored' };
        const ignoredList = await this.deps.git.listIgnored(repo, ['node_modules']);
        const ignoredRefs: BlobRef[] = [];
        for (let i = 0; i < ignoredList.length; i++) {
          const rel = ignoredList[i];
          yield {
            kind: 'file-progress',
            project,
            current: i + 1,
            total: ignoredList.length,
            path: rel,
          };
          try {
            ignoredRefs.push(
              await writer.putStream({ absPath: path.join(repo, rel), relPath: rel }),
            );
          } catch (err) {
            const msg = `skip ${rel}: ${(err as Error).message}`;
            warnings.push(msg);
            yield { kind: 'log', level: 'warn', project, message: msg };
          }
        }

        yield { kind: 'phase', project, phase: 'stash' };
        const stashMeta = await this.deps.git.listStashes(repo);
        const stashes: ProjectSnapshot['stashes'] = [];
        for (const s of stashMeta) {
          const patch = await this.deps.git.stashPatch(repo, s.idx);
          stashes.push({ message: s.message, patch, includesUntracked: s.includesUntracked });
        }

        const entry: ProjectSnapshot = {
          name: project.name,
          group: project.group,
          url: project.url,
          branch,
          head,
          trackedDiff,
          untrackedFiles: untrackedRefs,
          gitignoredFiles: ignoredRefs,
          stashes,
          warnings: warnings.length ? warnings : undefined,
        };
        bytes = JSON.stringify(entry).length;
        collected.push(entry);
        yield { kind: 'project-done', project, bytes, warnings: warnings.length };
      } catch (err) {
        yield { kind: 'project-error', project, error: (err as Error).message };
      }
    }

    if (input.projects[0])
      yield { kind: 'phase', project: input.projects[0], phase: 'finalizing' };
    const snapshot: Snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      label: input.label,
      projects: collected,
    };
    await writer.writeMetadata('snapshot.json', JSON.stringify(snapshot, null, 2));
    await writer.close();
    yield { kind: 'done', snapshot, path: input.snapshotPath };
  }

  async *restore(input: RestoreInput): AsyncGenerator<SnapshotEvent, void, void> {
    if (!this.deps.openReader) {
      throw new SnapshotError(
        'SnapshotEngine.restore requires deps.openReader',
        'E_SNAP_NO_READER',
      );
    }
    const git = this.deps.git as Required<SnapshotDeps['git']>;
    const reader = await this.deps.openReader(input.snapshotPath);

    try {
      for (const project of input.snapshot.projects) {
        yield { kind: 'project-start', project };
        const dest = this.deps.resolveProjectPath(input.rootDir, project);

        try {
          const exists = this.deps.destExists ? await this.deps.destExists(dest) : false;
          if (exists) {
            const decision = await input.onConflict(project);
            if (decision === 'abort') {
              throw new SnapshotError(
                `User aborted restore at ${project.group}/${project.name}`,
                'E_SNAP_CONFLICT_ABORT',
              );
            }
            if (decision === 'skip') {
              yield { kind: 'project-done', project, bytes: 0, warnings: 0 };
              continue;
            }
            if (decision === 'overwrite' && this.deps.removeDest) {
              await this.deps.removeDest(dest);
            }
          }

          yield { kind: 'phase', project, phase: 'clone' };
          for await (const ev of git.clone(project.url, dest)) {
            if (ev.message)
              yield { kind: 'log', level: 'info', project, message: ev.message };
          }

          yield { kind: 'phase', project, phase: 'checkout' };
          const remote = await git.lsRemoteHas(dest, project.branch);
          if (!remote)
            yield {
              kind: 'log',
              level: 'warn',
              project,
              message: `branch ${project.branch} not in remote — creating local-only`,
            };
          await git.checkoutBranch(dest, project.branch);

          yield { kind: 'phase', project, phase: 'reset' };
          await git.resetHard(dest, project.head);

          yield { kind: 'phase', project, phase: 'apply-diff' };
          if (project.trackedDiff) {
            try {
              await git.applyDiff(dest, project.trackedDiff);
            } catch (err) {
              yield {
                kind: 'log',
                level: 'warn',
                project,
                message: `apply-diff conflicts: ${(err as Error).message}`,
              };
            }
          }

          yield { kind: 'phase', project, phase: 'write-files' };
          const blobs = [...project.untrackedFiles, ...project.gitignoredFiles];
          for (let i = 0; i < blobs.length; i++) {
            const ref = blobs[i];
            yield {
              kind: 'file-progress',
              project,
              current: i + 1,
              total: blobs.length,
              path: ref.path,
            };
            try {
              await reader.getStream(ref, path.join(dest, ref.path));
            } catch (err) {
              yield {
                kind: 'log',
                level: 'warn',
                project,
                message: `skip ${ref.path}: ${(err as Error).message}`,
              };
            }
          }

          yield { kind: 'phase', project, phase: 'apply-stash' };
          for (let i = project.stashes.length - 1; i >= 0; i--) {
            const s = project.stashes[i];
            try {
              await git.applyStashPatch(dest, s.patch);
            } catch (err) {
              yield {
                kind: 'log',
                level: 'warn',
                project,
                message: `stash apply failed: ${(err as Error).message}`,
              };
            }
          }

          yield { kind: 'project-done', project, bytes: 0, warnings: 0 };
        } catch (err) {
          if (
            err instanceof SnapshotError &&
            err.code === 'E_SNAP_CONFLICT_ABORT'
          ) {
            throw err;
          }
          yield { kind: 'project-error', project, error: (err as Error).message };
        }
      }
    } finally {
      await reader.close();
    }

    yield { kind: 'done', snapshot: input.snapshot, path: input.snapshotPath };
  }
}
