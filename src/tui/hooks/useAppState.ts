import { useCallback, useState } from 'react';

export type Panel = 'groups' | 'projects';

/**
 * UI state machine for the App: which group is active, where the cursor is,
 * the selection set, which panel has focus, and the log tabs.
 * Pure — owns state and the small helpers, no other dependencies.
 */
export function useAppState() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>('groups');

  const toggleSelected = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback((names: string[]) => {
    setSelected(new Set(names));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const nextPanel = useCallback(() => {
    setPanel((p) => (p === 'groups' ? 'projects' : 'groups'));
  }, []);

  return {
    activeGroup,
    setActiveGroup,
    cursor,
    setCursor,
    selected,
    setSelected,
    panel,
    setPanel,
    toggleSelected,
    selectAll,
    clearSelection,
    nextPanel,
  };
}
