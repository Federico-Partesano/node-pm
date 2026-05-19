export type QuickActionId =
  | 'pull'
  | 'fetch'
  | 'install'
  | 'switchBranch'
  | 'runScript'
  | 'snapshotThis'
  | 'copyPath'
  | 'openShell'
  | 'remove';

export type QuickAction = {
  id: QuickActionId;
  icon: string;
  label: string;
  description: string;
  /** Requires the project's path to exist on disk. */
  requiresPath?: boolean;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'pull',
    icon: '⬇️ ',
    label: 'Pull',
    description: 'git pull sul progetto corrente',
    requiresPath: true,
  },
  {
    id: 'fetch',
    icon: '🔄',
    label: 'Fetch all',
    description: 'git fetch --all --prune per aggiornare i ref remoti',
    requiresPath: true,
  },
  {
    id: 'install',
    icon: '📥',
    label: 'Install',
    description: 'esegue il package manager rilevato (npm/pnpm/yarn/bun) install',
    requiresPath: true,
  },
  {
    id: 'switchBranch',
    icon: '🌿',
    label: 'Switch branch',
    description: 'mostra elenco branch locali + remoti e fa checkout',
    requiresPath: true,
  },
  {
    id: 'runScript',
    icon: '🏃',
    label: 'Run script',
    description: 'elenca gli script di package.json e ne esegue uno',
    requiresPath: true,
  },
  {
    id: 'snapshotThis',
    icon: '📦',
    label: 'Snapshot this project',
    description: 'crea un .npmsnap che contiene solo il progetto corrente',
    requiresPath: true,
  },
  {
    id: 'copyPath',
    icon: '📋',
    label: 'Print path',
    description: 'stampa il path assoluto del progetto nei log',
    requiresPath: true,
  },
  {
    id: 'remove',
    icon: '🗑 ',
    label: 'Remove from manifest',
    description: 'rimuove il progetto dal manifest (non tocca il filesystem)',
  },
];
