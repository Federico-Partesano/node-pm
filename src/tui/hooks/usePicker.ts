import { useState, useMemo, useCallback } from 'react';

export type PickerItem<T> = T;

type Args<T> = {
  items: T[];
  keyOf: (item: T) => string;
  groupOf?: (item: T) => string;
};

export type UsePickerResult<T> = {
  cursor: number;
  picked: Set<string>;
  groupFilter: string | null;
  visible: T[];
  pickedItems: T[];
  groups: string[];
  moveUp: () => void;
  moveDown: () => void;
  toggle: () => void;
  selectAllVisible: () => void;
  clear: () => void;
  cycleGroup: () => void;
};

export function usePicker<T>({ items, keyOf, groupOf }: Args<T>): UsePickerResult<T> {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      groupOf
        ? Array.from(new Set(items.map(groupOf))).sort()
        : [],
    [items, groupOf],
  );

  const visible = useMemo(
    () =>
      groupFilter && groupOf
        ? items.filter((it) => groupOf(it) === groupFilter)
        : items,
    [items, groupFilter, groupOf],
  );

  const pickedItems = useMemo(
    () => items.filter((it) => picked.has(keyOf(it))),
    [items, picked, keyOf],
  );

  const moveUp = useCallback(() => {
    setCursor((c) => (c > 0 ? c - 1 : c));
  }, []);

  const moveDown = useCallback(() => {
    setCursor((c) => (c < visible.length - 1 ? c + 1 : c));
  }, [visible.length]);

  const toggle = useCallback(() => {
    const it = visible[cursor];
    if (!it) return;
    const k = keyOf(it);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, [visible, cursor, keyOf]);

  const selectAllVisible = useCallback(() => {
    setPicked(new Set(visible.map(keyOf)));
  }, [visible, keyOf]);

  const clear = useCallback(() => {
    setPicked(new Set());
  }, []);

  const cycleGroup = useCallback(() => {
    if (groups.length === 0) return;
    setGroupFilter((prev) => {
      const idx = prev ? groups.indexOf(prev) : -1;
      return idx + 1 < groups.length ? groups[idx + 1] : null;
    });
    setCursor(0);
  }, [groups]);

  return {
    cursor,
    picked,
    groupFilter,
    visible,
    pickedItems,
    groups,
    moveUp,
    moveDown,
    toggle,
    selectAllVisible,
    clear,
    cycleGroup,
  };
}
