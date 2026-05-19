import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/manifest.js', () => ({
  ManifestStore: class {
    async load() { return {
      version: 1, root: '/r', concurrency: 5, projects: [
        { name: 'a', group: 'g1', url: 'u' },
        { name: 'b', group: 'g2', url: 'u' },
      ],
    }; }
    async list() { return [
      { name: 'a', group: 'g1', url: 'u' },
      { name: 'b', group: 'g2', url: 'u' },
    ]; }
    resolvePath(p: any) { return `/r/${p.group}/${p.name}`; }
    invalidate() {}
  },
}));
vi.mock('../../src/core/git.js', () => ({
  GitOps: class {
    async status() { return { branch: 'main', dirty: false, ahead: 0, behind: 0, exists: true }; }
    async fetch() {}
  },
}));
vi.mock('../../src/core/pm.js', () => ({
  PackageManager: class { async detect() { return 'npm' as const; } },
}));

import { App } from '../../src/tui/App.js';

beforeEach(() => vi.clearAllMocks());

async function selectProjectsFromHome(stdin: NodeJS.WritableStream) {
  // Wait for home to render then press Enter (Projects is the first item)
  await new Promise((r) => setTimeout(r, 100));
  stdin.write('\r');
  await new Promise((r) => setTimeout(r, 100));
}

describe('App', () => {
  it('opens on the home menu by default', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 120));
    const out = lastFrame() ?? '';
    expect(out).toContain('Cosa vuoi fare');
    expect(out).toContain('Projects');
    expect(out).toContain('Massive clone');
    expect(out).toContain('Quit');
  });

  it('shows manifest stats in home header', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 120));
    const out = lastFrame() ?? '';
    expect(out).toContain('groups');
    expect(out).toContain('projects');
  });

  it('shows loading state initially before manifest loads', () => {
    const { lastFrame } = render(<App />);
    const firstFrame = lastFrame() ?? '';
    expect(typeof firstFrame).toBe('string');
    expect(firstFrame.length).toBeGreaterThan(0);
  });

  it('home menu items hint at every action', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 120));
    const out = lastFrame() ?? '';
    expect(out).toContain('Add a project');
    expect(out).toContain('Scan wizard');
    expect(out).toContain('Export manifest');
  });

  it('after selecting Projects, main page renders both groups', async () => {
    const { stdin, lastFrame } = render(<App />);
    await selectProjectsFromHome(stdin);
    const out = lastFrame() ?? '';
    expect(out).toContain('Groups');
    expect(out).toContain('Projects');
    expect(out).toContain('g1');
    expect(out).toContain('g2');
  });

  it('main page renders Tasks and Logs panels', async () => {
    const { stdin, lastFrame } = render(<App />);
    await selectProjectsFromHome(stdin);
    const out = lastFrame() ?? '';
    expect(out).toContain('Tasks');
    expect(out).toContain('Logs');
  });

  it('main page footer shows tab/esc/quit hints', async () => {
    const { stdin, lastFrame } = render(<App />);
    await selectProjectsFromHome(stdin);
    const out = lastFrame() ?? '';
    expect(out).toContain('tab');
    expect(out).toContain('esc');
    expect(out).toContain('quit');
  });

  it('Tasks panel shows no tasks message when idle', async () => {
    const { stdin, lastFrame } = render(<App />);
    await selectProjectsFromHome(stdin);
    const out = lastFrame() ?? '';
    expect(out.toLowerCase()).toContain('no tasks queued');
  });

  it('home menu shows reduced item set when manifest empty', async () => {
    // override mock to return empty projects
    vi.resetModules();
    vi.doMock('../../src/core/manifest.js', () => ({
      ManifestStore: class {
        async load() { return { version: 1, root: '/r', concurrency: 5, projects: [] }; }
        async list() { return []; }
        resolvePath() { return ''; }
        invalidate() {}
      },
    }));
    const { App: EmptyApp } = await import('../../src/tui/App.js');
    const { lastFrame } = render(<EmptyApp />);
    await new Promise((r) => setTimeout(r, 120));
    const out = lastFrame() ?? '';
    expect(out).toContain('Massive clone');
    expect(out).toContain('Add a project');
    expect(out).toContain('Scan wizard');
    expect(out).not.toContain('📁  Projects'); // no manifest = no projects entry
  });

  it('home menu items render with arrow indicator on selected', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 120));
    const out = lastFrame() ?? '';
    expect(out).toMatch(/❯ \s*📁/);
  });
});
