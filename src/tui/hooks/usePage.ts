import { useCallback, useState } from 'react';

export type PageId =
  | 'home'
  | 'main'
  | 'wizard'
  | 'addProject'
  | 'bulkClone'
  | 'emptyHelp'
  | 'snapshot'
  | 'snapshotPicker'
  | 'settings'
  | 'sessions';

export type PageState = {
  id: PageId;
  // Free-form payload to pass between pages without lifting state up.
  data?: Record<string, unknown>;
};

/**
 * Tiny page router: tracks the current page and an optional payload.
 * goto() pushes a new page, back() returns to the previous one.
 */
export function usePage(initial: PageId = 'home') {
  const [stack, setStack] = useState<PageState[]>([{ id: initial }]);

  const goto = useCallback((id: PageId, data?: Record<string, unknown>) => {
    setStack((s) => [...s, { id, data }]);
  }, []);

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback((id: PageId, data?: Record<string, unknown>) => {
    setStack((s) => [...s.slice(0, -1), { id, data }]);
  }, []);

  const reset = useCallback((id: PageId = 'main') => {
    setStack([{ id }]);
  }, []);

  const current = stack[stack.length - 1]!;
  return { current, goto, back, replace, reset };
}
