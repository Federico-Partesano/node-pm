import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { SessionsPage } from '../../../src/tui/pages/SessionsPage.js';
import type { Session } from '../../../src/shared/types.js';

const sample: Session[] = [
  {
    id: 'dev',
    label: 'Dev stack',
    description: 'spawns api + web',
    terminals: [
      { name: 'api', projectRef: 'oss/api', cmd: 'npm run dev' },
      { name: 'web', projectRef: 'oss/web', cmd: 'npm run dev' },
    ],
  },
  {
    id: 'tests',
    label: 'Watch tests',
    terminals: [{ name: 't', projectRef: 'oss/api', cmd: 'npm test' }],
  },
];

describe('SessionsPage', () => {
  it('renders saved sessions in the sidebar', () => {
    const { lastFrame } = render(
      <SessionsPage
        width={100}
        height={24}
        sessions={sample}
        loading={false}
        resolveProjectPath={() => '/tmp'}
        onExit={() => {}}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Sessions');
    expect(out).toContain('dev');
    expect(out).toContain('tests');
  });

  it('shows empty state when there are no sessions', () => {
    const { lastFrame } = render(
      <SessionsPage
        width={100}
        height={24}
        sessions={[]}
        loading={false}
        resolveProjectPath={() => '/tmp'}
        onExit={() => {}}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('No sessions yet');
  });

  it('shows terminals and description for the selected session', () => {
    const { lastFrame } = render(
      <SessionsPage
        width={100}
        height={24}
        sessions={sample}
        loading={false}
        resolveProjectPath={() => '/tmp'}
        onExit={() => {}}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('spawns api + web');
    expect(out).toContain('api');
    expect(out).toContain('web');
    expect(out).toContain('npm run dev');
  });

  it('shows loading state', () => {
    const { lastFrame } = render(
      <SessionsPage
        width={100}
        height={24}
        sessions={[]}
        loading={true}
        resolveProjectPath={() => '/tmp'}
        onExit={() => {}}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out.toLowerCase()).toContain('loading');
  });
});
