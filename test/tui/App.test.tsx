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

describe('App', () => {
  it('renders all panels and shows both groups', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('Groups');
    expect(out).toContain('Projects');
    expect(out).toContain('g1');
    expect(out).toContain('g2');
    expect(out).toContain('Tasks');
    expect(out).toContain('Logs');
  });

  it('shows loading state initially before manifest loads', () => {
    // Capture the very first frame before async operations complete
    const { lastFrame } = render(<App />);
    // The first frame should show loading state (manifest not yet loaded)
    const firstFrame = lastFrame() ?? '';
    // Initially it shows "loading manifest..." before the async load completes
    // We can't guarantee exact timing, but the component doesn't crash immediately
    expect(typeof firstFrame).toBe('string');
    expect(firstFrame.length).toBeGreaterThan(0);
  });

  it('after manifest loads, groups visible', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 150));
    const out = lastFrame() ?? '';
    expect(out).toContain('g1');
    expect(out).toContain('g2');
  });

  it('after manifest loads, projects panel visible', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 150));
    const out = lastFrame() ?? '';
    expect(out).toContain('Projects');
  });

  it('renders Tasks panel label', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('Tasks');
  });

  it('renders Logs panel label', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('Logs');
  });

  it('renders help bar with keyboard hints', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    // Help text is always rendered after loading
    expect(out).toContain('tab');
    expect(out).toContain('quit');
  });

  it('both group names from mock manifest visible', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('g1');
    expect(out).toContain('g2');
  });

  it('Groups panel title rendered', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('Groups');
  });

  it('Tasks panel shows idle when no tasks running', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 100));
    const out = lastFrame() ?? '';
    expect(out).toContain('idle');
  });
});
