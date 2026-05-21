import { describe, it, expect } from 'vitest';
import {
  SessionSchema,
  TerminalSpecSchema,
  ManifestSchema,
} from '../../src/shared/types.js';

describe('TerminalSpecSchema', () => {
  it('parses a minimal terminal spec', () => {
    const result = TerminalSpecSchema.safeParse({
      name: 'api',
      projectRef: 'oss/api',
      cmd: 'npm run dev',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional cwd and env', () => {
    const result = TerminalSpecSchema.safeParse({
      name: 'api',
      projectRef: 'oss/api',
      cmd: 'npm run dev',
      cwd: '/tmp/x',
      env: { PORT: '4000' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      TerminalSpecSchema.safeParse({ name: '', projectRef: 'a/b', cmd: 'x' }).success,
    ).toBe(false);
  });

  it('rejects empty cmd', () => {
    expect(
      TerminalSpecSchema.safeParse({ name: 'a', projectRef: 'a/b', cmd: '' }).success,
    ).toBe(false);
  });
});

describe('SessionSchema', () => {
  const validSession = {
    id: 'dev',
    label: 'Dev stack',
    terminals: [
      { name: 'api', projectRef: 'oss/api', cmd: 'npm run dev' },
    ],
  };

  it('parses a minimal session', () => {
    expect(SessionSchema.safeParse(validSession).success).toBe(true);
  });

  it('accepts optional description', () => {
    const result = SessionSchema.safeParse({
      ...validSession,
      description: 'spawns api + web in parallel',
    });
    expect(result.success).toBe(true);
  });

  it('rejects session with no terminals', () => {
    expect(
      SessionSchema.safeParse({ ...validSession, terminals: [] }).success,
    ).toBe(false);
  });

  it('rejects id with uppercase', () => {
    expect(
      SessionSchema.safeParse({ ...validSession, id: 'Dev' }).success,
    ).toBe(false);
  });

  it('rejects id starting with dash', () => {
    expect(
      SessionSchema.safeParse({ ...validSession, id: '-dev' }).success,
    ).toBe(false);
  });

  it('accepts id with digits and dashes', () => {
    expect(
      SessionSchema.safeParse({ ...validSession, id: 'dev-1_2' }).success,
    ).toBe(true);
  });
});

describe('ManifestSchema sessions field', () => {
  const baseManifest = {
    version: 1 as const,
    root: '/x',
    concurrency: 5,
    projects: [],
  };

  it('sessions field is optional', () => {
    const r = ManifestSchema.safeParse(baseManifest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sessions ?? []).toEqual([]);
  });

  it('accepts a manifest with sessions', () => {
    const r = ManifestSchema.safeParse({
      ...baseManifest,
      sessions: [
        {
          id: 'dev',
          label: 'Dev',
          terminals: [{ name: 'api', projectRef: 'oss/api', cmd: 'npm run dev' }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
