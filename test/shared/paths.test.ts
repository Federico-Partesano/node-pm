import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

vi.mock('env-paths', () => ({
  default: () => ({ config: '/fake/config/node-pm' }),
}));
vi.mock('platform-folders', () => ({
  getDocumentsFolder: () => '/fake/Documents',
}));

import { getConfigDir, getManifestPath, getDefaultRoot, expandHome } from '../../src/shared/paths.js';

describe('paths', () => {
  it('returns env-paths config dir', () => {
    expect(getConfigDir()).toBe('/fake/config/node-pm');
  });
  it('builds manifest path under config dir', () => {
    expect(getManifestPath()).toBe(path.join('/fake/config/node-pm', 'projects.json'));
  });
  it('returns Documents/projects as default root', () => {
    expect(getDefaultRoot()).toBe(path.join('/fake/Documents', 'projects'));
  });
  it('expands ~ to homedir', () => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    expect(expandHome('~/x')).toBe(path.join(home, 'x'));
    expect(expandHome('/abs/x')).toBe('/abs/x');
  });
});
