import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Tasks } from '../../src/tui/panels/Tasks.js';
import type { QueueTask } from '../../src/tui/hooks/useQueue.js';

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

  it('empty tasks list shows "idle"', () => {
    const { lastFrame } = render(<Tasks tasks={[]} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('idle');
  });

  it('running task with 60% progress shows percent', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'run:x', status: 'running', progress: { phase: 'run', percent: 60 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('60%');
    expect(out).toContain('run:x');
  });

  it('running task with 60% progress shows filled bar portion (█ and ░)', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'task:bar', status: 'running', progress: { phase: 'run', percent: 60 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    // At 60% of width=12: 7 filled, 5 empty
    expect(out).toContain('█');
    expect(out).toContain('░');
  });

  it('running task at progress 0% shows empty bar (all ░)', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'zero:task', status: 'running', progress: { phase: 'run', percent: 0 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('░');
    // 0 filled chars at 0%
    expect(out).toContain('0%');
  });

  it('running task at progress 100% shows full bar (all █)', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'full:task', status: 'running', progress: { phase: 'run', percent: 100 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('100%');
    expect(out).toContain('████████████');
  });

  it('running task with no progress (undefined) shows "..." marker', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'noprog:task', status: 'running' },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('...');
    expect(out).toContain('noprog:task');
  });

  it('done task renders with ✓', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'done-task', status: 'done' },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('✓');
    expect(out).toContain('done-task');
  });

  it('errored task renders with ✗ and error message', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'err:task', status: 'error', error: new Error('something went wrong') },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('✗');
    expect(out).toContain('err:task');
    expect(out).toContain('something went wrong');
  });

  it('errored task without message shows "error" placeholder', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'noerrmsg', status: 'error', error: {} },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('✗');
    expect(out).toContain('error');
  });

  it('mixed list of 3 statuses: each rendered correctly', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'running-one', status: 'running', progress: { phase: 'pull', percent: 40 } },
        { name: 'done-one', status: 'done' },
        { name: 'error-one', status: 'error', error: new Error('fail') },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('running-one');
    expect(out).toContain('40%');
    expect(out).toContain('✓');
    expect(out).toContain('done-one');
    expect(out).toContain('✗');
    expect(out).toContain('error-one');
    expect(out).toContain('fail');
    // No idle message when tasks exist
    expect(out).not.toContain('idle');
  });

  it('long task name is handled without crashing', () => {
    const longName = 'very-long-operation-name:with-a-very-long-project-name-appended';
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: longName, status: 'running', progress: { phase: 'run', percent: 50 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('very-long-operation-name');
  });

  it('running task shows ▶ prefix', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'prefixed:task', status: 'running', progress: { phase: 'x', percent: 10 } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('▶');
  });

  it('multiple done tasks all show ✓', () => {
    const tasks: QueueTask[] = [
      { name: 'done-a', status: 'done' },
      { name: 'done-b', status: 'done' },
      { name: 'done-c', status: 'done' },
    ];
    const { lastFrame } = render(<Tasks tasks={tasks} />);
    const out = lastFrame() ?? '';
    const checkCount = (out.match(/✓/g) ?? []).length;
    expect(checkCount).toBe(3);
  });

  it('renders Tasks panel title', () => {
    const { lastFrame } = render(<Tasks tasks={[]} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Tasks');
  });

  it('running task with progress but undefined percent shows "..." and ░-bar', () => {
    const { lastFrame } = render(
      <Tasks tasks={[
        { name: 'nopct:task', status: 'running', progress: { phase: 'clone' } },
      ]} />,
    );
    const out = lastFrame() ?? '';
    // percent is undefined → '...' marker
    expect(out).toContain('...');
    // bar uses -1 fill path → all ░
    expect(out).toContain('░');
  });
});
