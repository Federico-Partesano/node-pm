export type HomeAction =
  | 'projects'
  | 'bulkClone'
  | 'addProject'
  | 'wizard'
  | 'export'
  | 'snapshotCreate'
  | 'snapshotRestore'
  | 'settings'
  | 'quit';

export type HomeMenuItem = {
  value: HomeAction;
  icon: string;
  label: string;
  short: string;
  title: string;
  description: string[];
  keys?: { key: string; label: string }[];
};

export const HOME_MENU_ITEMS: Record<HomeAction, HomeMenuItem> = {
  projects: {
    value: 'projects',
    icon: '📁',
    label: 'Projects',
    short: 'browse, pull, clone, install',
    title: 'Projects — vista principale',
    description: [
      "Apre la vista a tre pannelli su tutti i progetti del manifest: gruppi a sinistra, lista progetti al centro, dettaglio + log a destra.",
      "",
      "Da qui puoi navigare i repo, selezionare singoli progetti o gruppi interi, eseguire bulk pull / clone / install, lanciare lo script preferito e vedere lo stato git in tempo reale (branch, ahead/behind, dirty).",
      "",
      "È la pagina che usi nel giorno per giorno una volta che hai aggiunto i progetti al manifest.",
    ],
    keys: [
      { key: 'space', label: 'seleziona progetto sotto il cursore' },
      { key: 'a / A', label: 'seleziona tutti / pulisci selezione' },
      { key: 'p / c / i', label: 'pull / clone / install selezionati' },
      { key: 'r', label: 'esegue lo script preferito sul progetto corrente' },
      { key: 'tab', label: 'passa al pannello successivo' },
    ],
  },
  bulkClone: {
    value: 'bulkClone',
    icon: '🚀',
    label: 'Massive clone',
    short: 'paste git URLs and clone in bulk',
    title: 'Massive clone — clonazione di massa',
    description: [
      "Incolli una lista di URL git (uno per riga) e tutti i repo vengono clonati in parallelo sotto la root del manifest.",
      "",
      "Ogni URL viene auto-classificato in un gruppo (puoi specificare un gruppo di default) e aggiunto al manifest. Se la cartella di destinazione esiste già con un repo git, il clone viene saltato (idempotente).",
      "",
      "Utile per il primo setup di una macchina nuova o per portare al volo un set di repo da un team mate.",
    ],
  },
  addProject: {
    value: 'addProject',
    icon: '➕',
    label: 'Add a project',
    short: 'single repo by URL',
    title: 'Add a project — aggiunta singola',
    description: [
      "Form puntuale per aggiungere un solo repo: incolli URL, scegli gruppo e nome, conferma.",
      "",
      "Differente dal Massive clone: non clona automaticamente, registra solo l'entry nel manifest. Usalo quando vuoi tenere traccia di un repo che hai già clonato a mano, o quando ti serve aggiungere un singolo progetto senza aprire la form massiva.",
    ],
  },
  wizard: {
    value: 'wizard',
    icon: '🔍',
    label: 'Scan wizard',
    short: 'auto-discover repos under root',
    title: 'Scan wizard — auto-discovery',
    description: [
      "Scansiona ricorsivamente la root configurata e trova ogni cartella che è un repository git. Mostra una lista di review con tutto ciò che ha scovato.",
      "",
      "Per ogni progetto nuovo (non ancora nel manifest) viene mostrato un badge NEW giallo. La selezione di default include solo i progetti nuovi — se è la prima esecuzione, vengono selezionati tutti.",
      "",
      "Confermando, i progetti scelti vengono aggiunti al manifest con name + group + url.",
    ],
    keys: [
      { key: 'space', label: 'toggle progetto sotto il cursore' },
      { key: 'a / A', label: 'seleziona tutti / pulisci' },
      { key: 'enter', label: 'salva i progetti scelti nel manifest' },
      { key: 'esc', label: 'torna indietro / cambia root' },
    ],
  },
  export: {
    value: 'export',
    icon: '💾',
    label: 'Export manifest',
    short: 'save project list to JSON (no working state)',
    title: 'Export manifest — esporta lista progetti',
    description: [
      "Salva il manifest (lista dei progetti con name, group, url) in un singolo file JSON. È un export LEGGERO: niente file, niente diff, niente .env, niente segreti.",
      "",
      "Quando usarlo:",
      "  • condividere la lista repo con un collega senza esporre nulla di sensibile",
      "  • backup veloce del manifest prima di una modifica grossa",
      "  • alternativa locale a `pm sync push` quando non vuoi usare Gist",
      "",
      "Importi con `pm import <file.json>` (CLI). Per uno stato di lavoro completo serve invece Snapshot create.",
    ],
  },
  snapshotCreate: {
    value: 'snapshotCreate',
    icon: '📦',
    label: 'Snapshot create',
    short: 'capture project working state',
    title: 'Snapshot create — backup totale stato di lavoro',
    description: [
      "Cattura lo stato VIVO di uno o più progetti in un singolo file .npmsnap (uno zip con metadati JSON + blob binari content-addressed).",
      "",
      "Per ogni progetto selezionato salva:",
      "  • URL remoto, branch corrente, commit HEAD",
      "  • diff delle modifiche tracked non committate",
      "  • tutti i file untracked (.gitignore rispettato escluso per .env)",
      "  • tutti i file gitignored (eccetto node_modules/)",
      "  • lista completa degli stash",
      "",
      "Apre prima un picker dove scegli quali progetti includere (space per toggle, a per tutti). Streaming I/O: anche file binari da 200 MB+ passano senza saturare la RAM. .env e altri segreti sono INCLUSI: non condividere il .npmsnap su gist pubblici.",
    ],
    keys: [
      { key: 'space', label: 'toggle progetto nel picker' },
      { key: 'a / A', label: 'seleziona tutti / pulisci' },
      { key: 'g', label: 'cicla filtro per gruppo' },
      { key: 'enter', label: 'avvia snapshot dei selezionati' },
    ],
  },
  snapshotRestore: {
    value: 'snapshotRestore',
    icon: '♻️ ',
    label: 'Snapshot restore',
    short: 'restore from a .npmsnap',
    title: 'Snapshot restore — ripristina stato da .npmsnap',
    description: [
      "Apre il .npmsnap più recente in snapshotDir e ricostruisce lo stato di lavoro byte-exact per ogni progetto contenuto.",
      "",
      "Per ogni progetto fa: clone dell'url → checkout del branch originale → reset --hard al commit catturato → riapplica il diff non committato → ripristina file untracked e gitignored → riapplica gli stash.",
      "",
      "Se la cartella destinazione esiste già, viene sovrascritta (modalità overwrite automatica dal TUI). Da CLI puoi scegliere skip / overwrite / abort per ogni progetto via --on-conflict.",
      "",
      "Utile per: macchina nuova dopo un wipe, ripristino dopo refactor andato male, riproduzione di un bug state da un collega.",
    ],
  },
  settings: {
    value: 'settings',
    icon: '⚙️ ',
    label: 'Settings',
    short: 'configure snapshotDir',
    title: 'Settings — configurazione',
    description: [
      "Pagina minimale di impostazioni. Per ora un solo campo configurabile:",
      "",
      "  • snapshotDir — cartella dove vengono salvati i file .npmsnap quando lanci Snapshot create. Default: ~/.config/node-pm/snapshots/",
      "",
      "Il valore viene persistito nel manifest e usato dal TUI e dalla CLI (`pm snapshot create/list`). Da CLI puoi cambiarlo anche con `pm config set snapshotDir <path>`.",
    ],
  },
  quit: {
    value: 'quit',
    icon: '⏻ ',
    label: 'Quit',
    short: 'exit node-pm',
    title: 'Quit — chiudi node-pm',
    description: [
      "Esce dal TUI e torna alla shell. Non c'è nulla da salvare: ogni operazione che modifica il manifest viene già scritta su disco al momento.",
      "",
      "Equivale a premere `q` da qualsiasi pagina home.",
    ],
  },
};

export const HOME_MENU_ORDER_FULL: HomeAction[] = [
  'projects',
  'bulkClone',
  'addProject',
  'wizard',
  'export',
  'snapshotCreate',
  'snapshotRestore',
  'settings',
  'quit',
];

export const HOME_MENU_ORDER_EMPTY: HomeAction[] = [
  'bulkClone',
  'addProject',
  'wizard',
  'snapshotRestore',
  'settings',
  'quit',
];
