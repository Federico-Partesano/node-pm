import { useEffect, useState } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';

export type ProjectHealth = {
  hasPackageJson: boolean;
  hasTsconfig: boolean;
  hasEslint: boolean;
  hasVitest: boolean;
  hasJest: boolean;
  hasGitHooks: boolean;
  scripts: Record<string, string>;
  fileCount: number;
  size: number;
  scriptHints: {
    lint?: string;
    typecheck?: string;
    test?: string;
    coverage?: string;
    build?: string;
    format?: string;
  };
};

const ESLINT_HINTS = [
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
];

const VITEST_HINTS = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function anyExists(dir: string, names: string[]): Promise<boolean> {
  for (const n of names) {
    if (await exists(path.join(dir, n))) return true;
  }
  return false;
}

async function readPackageScripts(dir: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.scripts === 'object') {
      return parsed.scripts as Record<string, string>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function inferHints(scripts: Record<string, string>): ProjectHealth['scriptHints'] {
  const names = Object.keys(scripts);
  function findOne(...patterns: RegExp[]): string | undefined {
    for (const re of patterns) {
      const m = names.find((n) => re.test(n));
      if (m) return m;
    }
    return undefined;
  }
  return {
    lint: findOne(/^lint(:check)?$/, /^lint$/i, /\blint\b/),
    typecheck: findOne(/^typecheck$/, /^tsc$/, /^check-types$/, /^types(:check)?$/),
    test: findOne(/^test$/, /^tests$/, /^vitest$/, /^jest$/),
    coverage: findOne(/coverage/),
    build: findOne(/^build$/, /^compile$/),
    format: findOne(/^format(:check)?$/, /^prettier(:check)?$/),
  };
}

async function shallowCount(dir: string): Promise<{ files: number; size: number }> {
  let files = 0;
  let size = 0;
  const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', '.cache', 'coverage']);
  async function walk(d: string, depth: number) {
    if (depth > 3) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if (e.isFile()) {
        files += 1;
        try {
          const st = await fs.stat(full);
          size += st.size;
        } catch {
          /* ignore */
        }
        if (files > 5000) return; // cap
      }
    }
  }
  await walk(dir, 0);
  return { files, size };
}

export function useProjectHealth(projectPath: string | null) {
  const [health, setHealth] = useState<ProjectHealth | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) {
      setHealth(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const hasPackageJson = await exists(path.join(projectPath, 'package.json'));
      const hasTsconfig = await exists(path.join(projectPath, 'tsconfig.json'));
      const hasEslint = await anyExists(projectPath, ESLINT_HINTS);
      const hasVitest = await anyExists(projectPath, VITEST_HINTS);
      const hasJest = await exists(path.join(projectPath, 'jest.config.js'))
        || await exists(path.join(projectPath, 'jest.config.ts'));
      const hasGitHooks = await exists(path.join(projectPath, '.husky'))
        || await exists(path.join(projectPath, '.git', 'hooks', 'pre-commit'));
      const scripts = hasPackageJson ? await readPackageScripts(projectPath) : {};
      const scriptHints = inferHints(scripts);
      const { files, size } = await shallowCount(projectPath);
      if (cancelled) return;
      setHealth({
        hasPackageJson,
        hasTsconfig,
        hasEslint,
        hasVitest,
        hasJest,
        hasGitHooks,
        scripts,
        scriptHints,
        fileCount: files,
        size,
      });
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return { health, loading };
}
