import { z } from 'zod';

export const ProjectSchema = z.object({
  name: z.string().min(1),
  group: z.string().min(1),
  url: z.string().min(1),
  defaultBranch: z.string().optional(),
  tags: z.array(z.string()).optional(),
  scripts: z
    .object({ favorites: z.array(z.string()).optional() })
    .optional(),
});

export const SyncStateSchema = z.object({
  gistId: z.string(),
  lastSync: z.string().datetime(),
});

export const TerminalSpecSchema = z.object({
  name: z.string().min(1),
  projectRef: z.string().min(1),
  cmd: z.string().min(1),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});
export type TerminalSpec = z.infer<typeof TerminalSpecSchema>;

export const SessionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-_]*$/),
  label: z.string().min(1),
  description: z.string().optional(),
  terminals: z.array(TerminalSpecSchema).min(1),
});
export type Session = z.infer<typeof SessionSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  root: z.string().min(1),
  concurrency: z.number().int().positive().default(5),
  sync: SyncStateSchema.optional(),
  snapshotDir: z.string().optional(),
  projects: z.array(ProjectSchema),
  sessions: z.array(SessionSchema).optional(),
});

export const BlobRefSchema = z.object({
  path: z.string(),
  blob: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  mode: z.string().optional(),
});
export type BlobRef = z.infer<typeof BlobRefSchema>;

export const StashEntrySchema = z.object({
  message: z.string(),
  patch: z.string(),
  includesUntracked: z.boolean(),
});
export type StashEntry = z.infer<typeof StashEntrySchema>;

export const ProjectSnapshotSchema = z.object({
  name: z.string(),
  group: z.string(),
  url: z.string(),
  branch: z.string(),
  head: z.string(),
  trackedDiff: z.string(),
  untrackedFiles: z.array(BlobRefSchema),
  gitignoredFiles: z.array(BlobRefSchema),
  stashes: z.array(StashEntrySchema),
  warnings: z.array(z.string()).optional(),
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

export const SnapshotSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  projects: z.array(ProjectSnapshotSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export type Project = z.infer<typeof ProjectSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;

export type PMName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type GitStatus = {
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  exists: boolean;
};

export type Progress = {
  phase: string;
  percent?: number;
  message?: string;
};

export type DiscoveredProject = Omit<Project, 'tags' | 'scripts'>;

export type RunHandle = {
  id: string;
  project: Project;
  script: string;
  status: 'running' | 'exited' | 'killed';
  exitCode: number | null;
  onStdout: (cb: (line: string) => void) => () => void;
  onStderr: (cb: (line: string) => void) => () => void;
  wait: () => Promise<number>;
  kill: () => void;
};
