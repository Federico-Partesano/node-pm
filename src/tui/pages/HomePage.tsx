import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Header } from '../components/Header.js';
import { Footer, type KeyHint } from '../components/Footer.js';
import { useHomeMenu } from '../hooks/useHomeMenu.js';
import type { HomeAction } from '../config/homeMenuItems.js';

export type { HomeAction };

const HOME_HINTS: KeyHint[] = [
  { key: '↑↓/jk', label: 'nav' },
  { key: 'enter', label: 'open' },
  { key: 'q', label: 'quit' },
];

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
  const { items, cursor, current, moveUp, moveDown } = useHomeMenu({
    hasManifest,
    totalProjects,
  });

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (key.upArrow || input === 'k') moveUp();
    if (key.downArrow || input === 'j') moveDown();
    if (key.return) {
      if (current.value === 'quit') exit();
      else onSelect(current.value);
    }
  });

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
                  <Text bold={cur} color={cur ? 'whiteBright' : undefined}>
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
