import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { useAppState } from '../../src/tui/hooks/useAppState.js';

// useAppState is a pure state hook with no side effects, so we drive it
// via a tiny harness component and capture the latest snapshot.

type Snapshot = ReturnType<typeof useAppState>;

function Harness({ capture }: { capture: (s: Snapshot) => void }) {
  const state = useAppState();
  capture(state);
  return null;
}

function mountState() {
  let latest: Snapshot | undefined;
  render(<Harness capture={(s) => { latest = s; }} />);
  if (!latest) throw new Error('hook did not run');
  return {
    get current() {
      if (!latest) throw new Error('no snapshot');
      return latest;
    },
  };
}

describe('useAppState', () => {
  it('toggleSelected adds then removes a name', () => {
    const h = mountState();
    h.current.toggleSelected('alpha');
    expect(h.current.selected.has('alpha')).toBe(true);
    h.current.toggleSelected('alpha');
    expect(h.current.selected.has('alpha')).toBe(false);
  });

  it('selectAll replaces selection with the given names', () => {
    const h = mountState();
    h.current.toggleSelected('keep');
    h.current.selectAll(['a', 'b', 'c']);
    expect([...h.current.selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clearSelection empties the set', () => {
    const h = mountState();
    h.current.selectAll(['a', 'b']);
    h.current.clearSelection();
    expect(h.current.selected.size).toBe(0);
  });

  it('nextPanel cycles groups -> projects -> groups', () => {
    const h = mountState();
    expect(h.current.panel).toBe('groups');
    h.current.nextPanel();
    expect(h.current.panel).toBe('projects');
    h.current.nextPanel();
    expect(h.current.panel).toBe('groups');
  });
});
