import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mock TextInput captures the latest onChange/onSubmit callbacks for the
// currently-rendered input field. Tests drive the form by calling these.
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
  // Mimic typing: notify onChange so the parent's state catches up, then submit.
  currentOnChange?.(value);
  currentOnSubmit?.(value);
}

const addProjectMock = vi.fn(async (_p: { name: string; group: string; url: string }) => {});
vi.mock('../../../src/core/manifest.js', () => ({
  ManifestStore: class {
    addProject = addProjectMock;
  },
}));

import { AddProjectForm } from '../../../src/tui/components/AddProjectForm.js';

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  currentOnChange = null;
  currentOnSubmit = null;
  addProjectMock.mockClear();
});

describe('AddProjectForm', () => {
  it('renders both labels for url and group', () => {
    const { lastFrame } = render(<AddProjectForm onDone={() => {}} onCancel={() => {}} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Git URL');
    expect(out).toContain('Group');
  });

  it('initial focus is the URL field with empty input', () => {
    const { lastFrame } = render(<AddProjectForm onDone={() => {}} onCancel={() => {}} />);
    const out = lastFrame() ?? '';
    // URL field rendered with empty input
    expect(out).toContain('[input:]');
  });

  it('happy path: submit URL then group calls addProject and onDone', async () => {
    const onDone = vi.fn();
    render(<AddProjectForm onDone={onDone} onCancel={() => {}} />);
    submit('git@github.com:u/foo.git');
    await wait(10);
    submit('OSS');
    await wait(20);
    expect(addProjectMock).toHaveBeenCalledTimes(1);
    expect(addProjectMock.mock.calls[0]![0]).toMatchObject({
      name: 'foo',
      group: 'OSS',
      url: 'git@github.com:u/foo.git',
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('empty URL submission shows an error and does not advance', async () => {
    const onDone = vi.fn();
    const { lastFrame } = render(<AddProjectForm onDone={onDone} onCancel={() => {}} />);
    submit('');
    await wait(10);
    const out = lastFrame() ?? '';
    expect(out).toContain('URL is required');
    expect(addProjectMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("group default 'OSS' is used when group submission is empty", async () => {
    const onDone = vi.fn();
    render(<AddProjectForm onDone={onDone} onCancel={() => {}} />);
    submit('https://github.com/x/bar.git');
    await wait(10);
    submit('   '); // whitespace only → defaults to OSS
    await wait(20);
    expect(addProjectMock).toHaveBeenCalledWith(expect.objectContaining({ group: 'OSS', name: 'bar' }));
  });
});
