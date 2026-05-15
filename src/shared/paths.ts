import path from 'node:path';
import os from 'node:os';
import envPaths from 'env-paths';
import { getDocumentsFolder } from 'platform-folders';

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

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
