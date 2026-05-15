import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
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
  | 'quit';

type Item = { label: string; value: HomeAction };

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
  width, height, root, totalProjects, totalGroups, hasManifest, onSelect,
}: Props) {
  const { exit } = useApp();
  useInput((input) => { if (input === 'q') exit(); });

  const items: Item[] = hasManifest && totalProjects > 0
    ? [
        { label: '📁  Projects        — browse, pull, clone, install', value: 'projects' },
        { label: '🚀  Massive clone   — paste git URLs and clone in bulk', value: 'bulkClone' },
        { label: '➕  Add a project   — single repo by URL', value: 'addProject' },
        { label: '🔍  Scan wizard     — auto-discover repos under root', value: 'wizard' },
        { label: '💾  Export snapshot — save manifest to JSON', value: 'export' },
        { label: '⏻   Quit', value: 'quit' },
      ]
    : [
        { label: '🚀  Massive clone   — paste git URLs and clone in bulk', value: 'bulkClone' },
        { label: '➕  Add a project   — single repo by URL', value: 'addProject' },
        { label: '🔍  Scan wizard     — auto-discover repos under root', value: 'wizard' },
        { label: '⏻   Quit', value: 'quit' },
      ];

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header
        root={root}
        totalProjects={totalProjects}
        totalGroups={totalGroups}
        activeGroup={null}
      />
      <Box flexDirection="column" flexGrow={1} paddingX={3} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyanBright">What do you want to do?</Text>
        </Box>
        <SelectInput<HomeAction>
          items={items}
          onSelect={(item) => {
            if (item.value === 'quit') exit();
            else onSelect(item.value);
          }}
          indicatorComponent={({ isSelected }) => (
            <Text color={isSelected ? 'cyanBright' : 'gray'}>{isSelected ? '❯ ' : '  '}</Text>
          )}
          itemComponent={({ isSelected, label }) => (
            <Text color={isSelected ? 'whiteBright' : undefined} bold={isSelected}>
              {label}
            </Text>
          )}
        />
      </Box>
      <Footer hints={HOME_HINTS} />
    </Box>
  );
}
