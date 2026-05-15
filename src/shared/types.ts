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

export const ManifestSchema = z.object({
  version: z.literal(1),
  root: z.string().min(1),
  concurrency: z.number().int().positive().default(5),
  sync: SyncStateSchema.optional(),
  projects: z.array(ProjectSchema),
});

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
  kill: () => void;
};
