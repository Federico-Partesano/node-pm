import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Text } from 'ink';
import { TaskQueue } from '../../src/core/queue.js';
import { useQueue } from '../../src/tui/hooks/useQueue.js';

function Probe({ q }: { q: TaskQueue }) {
  const tasks = useQueue(q);
  return <Text>{tasks.map((t) => `${t.name}:${t.status}`).join(',')}</Text>;
}

describe('useQueue', () => {
  it('reflects start, progress and done events', async () => {
    const q = new TaskQueue(1);
    const { lastFrame } = render(<Probe q={q} />);
    void q.add('t1', async function* () {
      yield { phase: 'a', percent: 50 };
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(lastFrame()).toMatch(/t1:done/);
  });
});
