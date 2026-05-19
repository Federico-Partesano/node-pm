import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { SnapshotPage } from '../../../src/tui/pages/SnapshotPage.js';
import type { Project } from '../../../src/shared/types.js';
import type { SnapshotEvent } from '../../../src/core/snapshot.js';

const projects: Project[] = [
  { name: 'a', group: 'g', url: 'u-a' },
  { name: 'b', group: 'g', url: 'u-b' },
];

async function* feed(events: SnapshotEvent[]) {
  for (const e of events) {
    yield e;
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('SnapshotPage (create)', () => {
  it('renders both projects and marks them done when project-done events arrive', async () => {
    const events: SnapshotEvent[] = [
      { kind: 'project-start', project: projects[0] },
      { kind: 'project-done', project: projects[0], bytes: 10, warnings: 0 },
      { kind: 'project-start', project: projects[1] },
      { kind: 'project-done', project: projects[1], bytes: 20, warnings: 0 },
      {
        kind: 'done',
        snapshot: { version: 1, createdAt: new Date().toISOString(), projects: [] },
        path: '/x.npmsnap',
      },
    ];
    const { lastFrame } = render(
      <SnapshotPage
        mode="create"
        projects={projects}
        events={feed(events)}
        onExit={() => {}}
      />,
    );
    await new Promise((r) => setTimeout(r, 80));
    const out = lastFrame() ?? '';
    expect(out).toContain('g/a');
    expect(out).toContain('g/b');
    expect(out).toContain('✓');
  });
});
