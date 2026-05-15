import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { useAppState } from '../../src/tui/hooks/useAppState.js';

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
  it('initial state: activeGroup=null, cursor=null, panel=groups', () => {
    const h = mountState();
    expect(h.current.activeGroup).toBeNull();
    expect(h.current.cursor).toBeNull();
    expect(h.current.panel).toBe('groups');
  });

  it('initial state: selected is empty Set', () => {
    const h = mountState();
    expect(h.current.selected).toBeInstanceOf(Set);
    expect(h.current.selected.size).toBe(0);
  });

  it('toggleSelected adds when missing', () => {
    const h = mountState();
    h.current.toggleSelected('alpha');
    expect(h.current.selected.has('alpha')).toBe(true);
  });

  it('toggleSelected removes when present', () => {
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

  it('nextPanel cycles groups -> projects', () => {
    const h = mountState();
    expect(h.current.panel).toBe('groups');
    h.current.nextPanel();
    expect(h.current.panel).toBe('projects');
  });

  it('nextPanel cycles projects -> groups', () => {
    const h = mountState();
    h.current.nextPanel();
    expect(h.current.panel).toBe('projects');
    h.current.nextPanel();
    expect(h.current.panel).toBe('groups');
  });

  it('setActiveGroup updates activeGroup', () => {
    const h = mountState();
    h.current.setActiveGroup('my-group');
    expect(h.current.activeGroup).toBe('my-group');
  });

  it('setCursor updates cursor', () => {
    const h = mountState();
    h.current.setCursor('my-project');
    expect(h.current.cursor).toBe('my-project');
  });

  it('setActiveGroup accepts null', () => {
    const h = mountState();
    h.current.setActiveGroup('g');
    h.current.setActiveGroup(null);
    expect(h.current.activeGroup).toBeNull();
  });

  it('toggleSelected is a stable reference across renders', () => {
    const snapshots: Snapshot[] = [];
    render(<Harness capture={(s) => snapshots.push(s)} />);
    // trigger an update by calling toggleSelected
    snapshots[snapshots.length - 1]!.toggleSelected('x');
    const refs = snapshots.map((s) => s.toggleSelected);
    // all references to toggleSelected should be the same (stable via useCallback)
    expect(refs.every((r) => r === refs[0])).toBe(true);
  });

  it('selectAll is a stable reference across renders', () => {
    const snapshots: Snapshot[] = [];
    render(<Harness capture={(s) => snapshots.push(s)} />);
    snapshots[snapshots.length - 1]!.selectAll(['x']);
    const refs = snapshots.map((s) => s.selectAll);
    expect(refs.every((r) => r === refs[0])).toBe(true);
  });

  it('clearSelection is a stable reference across renders', () => {
    const snapshots: Snapshot[] = [];
    render(<Harness capture={(s) => snapshots.push(s)} />);
    snapshots[snapshots.length - 1]!.clearSelection();
    const refs = snapshots.map((s) => s.clearSelection);
    expect(refs.every((r) => r === refs[0])).toBe(true);
  });
});
