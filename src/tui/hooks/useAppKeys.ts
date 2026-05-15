import { useApp, useInput } from 'ink';

type Args = {
  enabled: boolean;
  onTab: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPull: () => void;
  onClone: () => void;
  onInstall: () => void;
  onRun: () => void;
  onAddProject?: () => void;
};

/**
 * Wires the App's global keybindings: q quits, tab cycles panels,
 * a/A select-all/clear, p/c/i bulk actions, r runs the favorite script,
 * n opens the add-project form. Bulk/run/add keys are gated by `enabled`.
 */
export function useAppKeys(a: Args): void {
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === 'q') exit();
    if (key.tab) a.onTab();
    if (input === 'a') a.onSelectAll();
    if (input === 'A') a.onClearSelection();
    if (!a.enabled) return;
    if (input === 'p') a.onPull();
    if (input === 'c') a.onClone();
    if (input === 'i') a.onInstall();
    if (input === 'r') a.onRun();
    if (input === 'n' && a.onAddProject) a.onAddProject();
  });
}
