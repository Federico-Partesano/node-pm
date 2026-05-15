import { describe, it, expect } from 'vitest';
import { ManifestSchema, ProjectSchema } from '../../src/shared/types.js';

describe('schemas', () => {
  it('accepts a valid project', () => {
    const result = ProjectSchema.safeParse({
      name: 'repo-blessed',
      group: 'PERSONALE',
      url: 'git@github.com:user/repo-blessed.git',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a project with empty name', () => {
    const result = ProjectSchema.safeParse({ name: '', group: 'g', url: 'u' });
    expect(result.success).toBe(false);
  });

  it('parses a minimal manifest', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      root: '~/Documents/projects',
      concurrency: 5,
      projects: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a manifest with wrong version', () => {
    const result = ManifestSchema.safeParse({
      version: 99,
      root: '/tmp',
      concurrency: 5,
      projects: [],
    });
    expect(result.success).toBe(false);
  });
});
