import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Header } from '../components/Header.js';
import { Footer, type KeyHint } from '../components/Footer.js';

const HOME_HINTS: KeyHint[] = [
  { key: '↑↓/jk', label: 'nav' },
  { key: 'enter', label: 'open' },
  { key: 'q', label: 'quit' },
];

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

type Item = {
  value: HomeAction;
  icon: string;
  label: string;
  short: string;
  title: string;
  description: string[];
  keys?: { key: string; label: string }[];
};

const ALL_ITEMS: Record<HomeAction, Item> = {
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

type Props = {
  width: number;
  height: number;
  root: string;
  totalProjects: number;
  totalGroups: number;
  hasManifest: boolean;
  onSelect: (action: HomeAction) => void;
};

export const HomePage = React.memo(HomePageImpl);
function HomePageImpl({
  width,
  height,
  root,
  totalProjects,
  totalGroups,
  hasManifest,
  onSelect,
}: Props) {
  const { exit } = useApp();

  const order: HomeAction[] =
    hasManifest && totalProjects > 0
      ? [
          'projects',
          'bulkClone',
          'addProject',
          'wizard',
          'export',
          'snapshotCreate',
          'snapshotRestore',
          'settings',
          'quit',
        ]
      : [
          'bulkClone',
          'addProject',
          'wizard',
          'snapshotRestore',
          'settings',
          'quit',
        ];

  const items: Item[] = order.map((a) => ALL_ITEMS[a]);
  const [cursor, setCursor] = useState(0);
  const current = items[cursor]!;

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && cursor > 0) setCursor(cursor - 1);
    if (down && cursor < items.length - 1) setCursor(cursor + 1);
    if (key.return) {
      if (current.value === 'quit') exit();
      else onSelect(current.value);
    }
  });

  // Sidebar 38 cols, rest = detail
  const sidebarWidth = 38;
  const detailWidth = Math.max(20, width - sidebarWidth - 6);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header
        root={root}
        totalProjects={totalProjects}
        totalGroups={totalGroups}
        activeGroup={null}
      />
      <Box flexDirection="row" flexGrow={1} paddingX={2} paddingY={1}>
        <Box
          flexDirection="column"
          width={sidebarWidth}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          paddingY={1}
          marginRight={1}
        >
          <Text bold color="cyanBright">
            Cosa vuoi fare?
          </Text>
          <Box marginTop={1} flexDirection="column">
            {items.map((it, i) => {
              const cur = i === cursor;
              return (
                <Box key={it.value}>
                  <Text color={cur ? 'cyanBright' : 'gray'}>
                    {cur ? '❯ ' : '  '}
                  </Text>
                  <Text
                    bold={cur}
                    color={cur ? 'whiteBright' : undefined}
                  >
                    {it.icon} {it.label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>
        <Box
          flexDirection="column"
          width={detailWidth}
          flexGrow={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="yellowBright">
            {current.icon} {current.title}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {current.description.map((line, i) => (
              <Text key={i} wrap="wrap">
                {line || ' '}
              </Text>
            ))}
          </Box>
          {current.keys && current.keys.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold color="cyan">
                Tasti utili:
              </Text>
              {current.keys.map((k, i) => (
                <Text key={i}>
                  <Text color="yellow">{k.key.padEnd(12)}</Text>
                  <Text dimColor> {k.label}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Footer hints={HOME_HINTS} />
    </Box>
  );
}
