import React from 'react';
import { Box, Text } from 'ink';
import { Panel } from '../components/Panel.js';

export type LogTab = { id: string; label: string; lines: string[] };

type Props = { tabs: LogTab[]; activeId: string | null };

export function Logs({ tabs, activeId }: Props) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const subtitle = tabs.length === 0 ? 'no logs' : `${tabs.length} stream${tabs.length === 1 ? '' : 's'}`;
  return (
    <Panel title="Logs" subtitle={subtitle} accent="blue">
      {tabs.length > 0 && (
        <Box marginBottom={1}>
          {tabs.map((t, i) => {
            const isActive = t.id === active?.id;
            return (
              <Text key={t.id}>
                {i > 0 ? <Text dimColor> · </Text> : null}
                <Text
                  color={isActive ? 'blueBright' : 'gray'}
                  bold={isActive}
                  inverse={isActive}
                >
                  {' '}{t.label}{' '}
                </Text>
              </Text>
            );
          })}
        </Box>
      )}
      {!active && <Text dimColor>Run a script with </Text>}
      {!active && <Text color="cyan">r</Text>}
      {!active && <Text dimColor> to see live output here.</Text>}
      {active?.lines.slice(-20).map((l, i) => <Text key={i} dimColor={false}>{l}</Text>)}
    </Panel>
  );
}
