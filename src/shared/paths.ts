import path from 'node:path';
import os from 'node:os';
import nodefs from 'node:fs';
import envPaths from 'env-paths';
import { getDocumentsFolder } from 'platform-folders';
import type { Project } from './types.js';

const paths = envPaths('node-pm', { suffix: '' });

export function getConfigDir(): string {
  return paths.config;
}

export function getManifestPath(): string {
  return path.join(getConfigDir(), 'projects.json');
}

export function getDefaultRoot(): string {
  return path.join(getDocumentsFolder(), 'projects');
}

/**
 * Like getDefaultRoot, but if that path doesn't exist, fall back to
 * common alternatives that often do (lowercase 'documents', '~/projects',
 * '~/dev', '~/code'). Returns the first existing directory or the original
 * default if none exist.
 */
export function getBestRoot(): string {
  const candidates = [
    getDefaultRoot(),
    path.join(os.homedir(), 'documents', 'projects'),
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'dev'),
    path.join(os.homedir(), 'code'),
  ];
  for (const c of candidates) {
    try {
      if (nodefs.statSync(c).isDirectory()) return c;
    } catch {
      // skip
    }
  }
  return getDefaultRoot();
}

export function pathExists(p: string): boolean {
  try {
    return nodefs.statSync(expandHome(p)).isDirectory();
  } catch {
    return false;
  }
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function resolveProjectPath(root: string, p: Project): string {
  return path.join(expandHome(root), p.group, p.name);
}
