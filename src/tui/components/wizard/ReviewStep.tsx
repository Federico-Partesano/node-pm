import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DiscoveredProject, Project } from '../../../shared/types.js';

export type ReviewProps = {
  found: DiscoveredProject[];
  picked: Set<string>;
  cursor: number;
  existingKeys: Set<string>;
  existingProjects: Project[];
  onCursor: (i: number) => void;
  onToggle: (k: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onConfirm: () => void;
  onBack: () => void;
};

const keyOf = (p: { name: string; group: string }) => `${p.group}/${p.name}`;

export function ReviewStep(p: ReviewProps) {
  useInput((input, key) => {
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (up && p.cursor > 0) p.onCursor(p.cursor - 1);
    if (down && p.cursor < p.found.length - 1) p.onCursor(p.cursor + 1);
    if (input === ' ' && p.found[p.cursor]) p.onToggle(keyOf(p.found[p.cursor]!));
    if (input === 'a') p.onSelectAll();
    if (input === 'A') p.onClear();
    if (key.return) p.onConfirm();
  });

  const foundKeys = useMemo(() => new Set(p.found.map(keyOf)), [p.found]);

  const newOnes = useMemo(
    () => p.found.filter((d) => !p.existingKeys.has(keyOf(d))),
    [p.found, p.existingKeys],
  );

  const stale = useMemo(
    () => p.existingProjects.filter((proj) => !foundKeys.has(keyOf(proj))),
    [p.existingProjects, foundKeys],
  );

  if (p.found.length === 0 && stale.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} marginY={1}>
        <Text color="yellow">No projects discovered.</Text>
        <Text dimColor>Esc to retry with a different root.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexGrow={1} marginY={1}>
      <NewProjectsCard newOnes={newOnes} total={p.found.length} />
      {stale.length > 0 && <MissingProjectsCard stale={stale} />}
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyanBright">Review discovered projects ({p.picked.size}/{p.found.length} selected)</Text>
        <Box marginTop={1} flexDirection="column">
          {p.found.map((d, i) => {
            const k = keyOf(d);
            const sel = p.picked.has(k);
            const cur = i === p.cursor;
            const isNew = !p.existingKeys.has(k);
            return (
              <Box key={k}>
                <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
                <Text color={sel ? 'green' : 'gray'}>{sel ? '◉' : '○'}</Text>
                <Text> </Text>
                <Text bold={cur} color={isNew ? 'yellowBright' : undefined}>{d.group}/{d.name}</Text>
                {isNew && <Text color="yellow" bold> NEW</Text>}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}><Text dimColor>↑↓/jk nav · space toggle · a all · A clear · Enter save · Esc back</Text></Box>
      </Box>
    </Box>
  );
}

function NewProjectsCard({ newOnes, total }: { newOnes: DiscoveredProject[]; total: number }) {
  const hasExisting = total > newOnes.length;
  const color = newOnes.length > 0 ? 'yellow' : 'gray';
  return (
    <Box flexDirection="column" flexGrow={0} borderStyle="round" borderColor={color} paddingX={2} paddingY={1}>
      <Text>
        <Text bold color={newOnes.length > 0 ? 'yellowBright' : 'gray'}>
          {newOnes.length > 0 ? `✨ ${newOnes.length} new project(s) since last scan` : 'No new projects since last scan'}
        </Text>
        {hasExisting && <Text dimColor>  ({total - newOnes.length} already in manifest)</Text>}
      </Text>
      {newOnes.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {newOnes.slice(0, 20).map((d) => (
            <Text key={keyOf(d)} color="yellowBright">  ✦ {d.group}/{d.name}</Text>
          ))}
          {newOnes.length > 20 && (
            <Text dimColor>  …and {newOnes.length - 20} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

function MissingProjectsCard({ stale }: { stale: Project[] }) {
  return (
    <Box flexDirection="column" flexGrow={0} borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
      <Text bold color="redBright">
        🗑  {stale.length} progetto/i non più sul disco — saranno rimossi dal manifest
      </Text>
      <Box marginTop={1} flexDirection="column">
        {stale.slice(0, 20).map((p) => (
          <Text key={keyOf(p)} color="red">  ✗ {p.group}/{p.name}</Text>
        ))}
        {stale.length > 20 && (
          <Text dimColor>  …and {stale.length - 20} more</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Premi Esc per annullare e cambiare root se non vuoi rimuoverli.</Text>
      </Box>
    </Box>
  );
}
