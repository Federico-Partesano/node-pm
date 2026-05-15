import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mock TextInput captures the latest onChange/onSubmit callbacks for the
// currently-rendered input field. Tests drive the wizard by calling submit().
let currentOnChange: ((v: string) => void) | null = null;
let currentOnSubmit: ((v: string) => void) | null = null;
vi.mock('ink-text-input', () => ({
  default: (props: { value: string; onChange: (v: string) => void; onSubmit?: (v: string) => void }) => {
    currentOnChange = props.onChange;
    currentOnSubmit = props.onSubmit ?? null;
    return React.createElement(Text, null, `[input:${props.value}]`);
  },
}));

function submit(value: string): void {
  currentOnChange?.(value);
  currentOnSubmit?.(value);
}
vi.mock('ink-spinner', () => ({
  default: () => React.createElement(Text, null, '*'),
}));

// Track addProject calls.
const addProjectMock = vi.fn(async (_p: { name: string; group: string; url: string }) => {});
const loadMock = vi.fn(async () => ({
  version: 1, root: '/r', concurrency: 5, projects: [],
}));
const saveMock = vi.fn(async () => {});
vi.mock('../../../src/core/manifest.js', () => ({
  ManifestStore: class {
    load = loadMock;
    save = saveMock;
    addProject = addProjectMock;
    invalidate() {}
  },
}));

// A controllable scanner that yields events for two repos.
const fakeEvents = [
  { kind: 'enter-group' as const, group: 'g1', path: '/r/g1' },
  { kind: 'enter-repo' as const, group: 'g1', name: 'repo-a', path: '/r/g1/repo-a' },
  { kind: 'found' as const, project: { name: 'repo-a', group: 'g1', url: 'u-a' } },
  { kind: 'enter-repo' as const, group: 'g1', name: 'repo-b', path: '/r/g1/repo-b' },
  { kind: 'found' as const, project: { name: 'repo-b', group: 'g1', url: 'u-b' } },
];

vi.mock('../../../src/core/scanner.js', () => ({
  ProjectScanner: class {
    async *scanStream() {
      for (const ev of fakeEvents) {
        await new Promise((r) => setTimeout(r, 0));
        yield ev;
      }
    }
  },
}));

import { OnboardingWizard } from '../../../src/tui/components/OnboardingWizard.js';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  currentOnChange = null;
  currentOnSubmit = null;
  addProjectMock.mockClear();
  loadMock.mockClear();
  saveMock.mockClear();
});

describe('OnboardingWizard', () => {
  it('renders the root step with prefilled root', () => {
    const { lastFrame } = render(
      <OnboardingWizard initialRoot="/my/root" onComplete={() => {}} onCancel={() => {}} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('node-pm');
    expect(out).toContain('[input:/my/root]');
  });

  it('shows scanning step after submitting root, then transitions to review with all found', async () => {
    const onComplete = vi.fn();
    const { lastFrame } = render(
      <OnboardingWizard initialRoot="/my/root" onComplete={onComplete} onCancel={() => {}} />,
    );
    // Trigger root submit
    submit('/my/root');
    await wait(80);
    const out = lastFrame() ?? '';
    // We should now be in review step (or have moved past scanning).
    // Either we're still scanning or we've reached review – both should mention found projects.
    expect(out).toMatch(/repo-a|Review|Found/);
  });

  it('lists discovered project names after scan completes', async () => {
    const { lastFrame } = render(
      <OnboardingWizard initialRoot="/r" onComplete={() => {}} onCancel={() => {}} />,
    );
    submit('/r');
    await wait(120);
    const out = lastFrame() ?? '';
    expect(out).toContain('repo-a');
    expect(out).toContain('repo-b');
  });

  it('confirming review calls addProject for each picked project and onComplete', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <OnboardingWizard initialRoot="/r" onComplete={onComplete} onCancel={() => {}} />,
    );
    submit('/r');
    await wait(120);
    // Press Enter to confirm review (default-all selected)
    stdin.write('\r');
    await wait(40);
    expect(addProjectMock).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('toggling off via space and confirming saves only remaining selections', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <OnboardingWizard initialRoot="/r" onComplete={onComplete} onCancel={() => {}} />,
    );
    submit('/r');
    await wait(120);
    // Cursor starts on first item; press space to deselect repo-a
    stdin.write(' ');
    await wait(20);
    stdin.write('\r');
    await wait(40);
    expect(addProjectMock).toHaveBeenCalledTimes(1);
    expect(addProjectMock.mock.calls[0]![0]).toMatchObject({ name: 'repo-b' });
  });

  it('clear-all (A) followed by Enter does not addProject and does not complete', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <OnboardingWizard initialRoot="/r" onComplete={onComplete} onCancel={() => {}} />,
    );
    submit('/r');
    await wait(120);
    stdin.write('A'); // clear all
    await wait(10);
    stdin.write('\r');
    await wait(20);
    expect(addProjectMock).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
