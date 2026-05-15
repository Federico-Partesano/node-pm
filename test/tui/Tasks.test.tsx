import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Tasks } from '../../src/tui/panels/Tasks.js';

describe('Tasks panel', () => {
  it('renders running, done and errored tasks', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'pull:a', status: 'running', progress: { phase: 'pull', percent: 60 } },
        { name: 'install:b', status: 'done' },
        { name: 'clone:c', status: 'error', error: new Error('boom') },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('pull:a');
    expect(out).toContain('60');
    expect(out).toContain('install:b');
    expect(out).toContain('clone:c');
    expect(out).toContain('boom');
  });
});
