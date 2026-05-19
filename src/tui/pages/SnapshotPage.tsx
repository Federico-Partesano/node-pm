import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Project } from '../../shared/types.js';
import type { SnapshotEvent } from '../../core/snapshot.js';
import {
  useSnapshotEvents,
  CREATE_PHASES,
  RESTORE_PHASES,
} from '../hooks/useSnapshotEvents.js';
import { SnapshotHeaderCard } from '../components/snapshot/SnapshotHeaderCard.js';
import { ProjectsListCard } from '../components/snapshot/ProjectsListCard.js';
import { ActiveProjectCard } from '../components/snapshot/ActiveProjectCard.js';

type Props = {
  width: number;
  height: number;
  mode: 'create' | 'restore';
  projects: Project[];
  events: AsyncIterable<SnapshotEvent>;
  onExit: () => void;
  onRescan?: () => void;
};

const keyOf = (p: Project) => `${p.group}/${p.name}`;

export function SnapshotPage({
  width,
  height,
  mode,
  projects,
  events,
  onExit,
  onRescan,
}: Props) {
  const state = useSnapshotEvents(projects, events);
  const { rows, log, bytes, done, errors, warnings, finished, activeKey, outputPath } = state;
  const [showRescanPrompt, setShowRescanPrompt] = useState(true);

  const activeProject = activeKey
    ? projects.find((p) => keyOf(p) === activeKey) ?? null
    : null;
  const activeRow = activeKey ? rows.get(activeKey) ?? null : null;
  const phases = mode === 'create' ? CREATE_PHASES : RESTORE_PHASES;

  const shouldPromptRescan =
    finished && errors > 0 && !!onRescan && showRescanPrompt;

  useInput((input, key) => {
    if (shouldPromptRescan) {
      if (input === 'y' || input === 'Y') {
        setShowRescanPrompt(false);
        onRescan?.();
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setShowRescanPrompt(false);
        onExit();
        return;
      }
      return;
    }
    if (key.escape) onExit();
  });

  // Layout math
  const leftWidth = Math.floor(width * 0.4);
  const rightWidth = width - leftWidth;
  // Reserve ~5 lines for header + 2 for prompt
  const promptLines = shouldPromptRescan ? 3 : 1;
  const headerLines = outputPath ? 6 : 5;
  const bodyHeight = Math.max(8, height - headerLines - promptLines);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <SnapshotHeaderCard
        mode={mode}
        total={projects.length}
        done={done}
        errors={errors}
        warnings={warnings}
        bytes={bytes}
        outputPath={outputPath}
        finished={finished}
      />
      <Box flexDirection="row" flexGrow={1}>
        <ProjectsListCard
          projects={projects}
          rows={rows}
          activeKey={activeKey}
          width={leftWidth}
          height={bodyHeight}
        />
        <ActiveProjectCard
          project={activeProject}
          row={activeRow}
          phases={phases}
          log={log}
          width={rightWidth}
          height={bodyHeight}
          finished={finished}
          errors={errors}
        />
      </Box>
      <Box paddingX={2} flexDirection="column">
        {shouldPromptRescan ? (
          <Box>
            <Text color="yellowBright" bold>
              ⚠ {errors} progetti in errore.
            </Text>
            <Text>
              {' '}Vuoi rilanciare lo scan per aggiornare il manifest?{' '}
            </Text>
            <Text color="cyanBright" bold>
              [Y]
            </Text>
            <Text>es / </Text>
            <Text color="cyanBright" bold>
              [N]
            </Text>
            <Text>o</Text>
          </Box>
        ) : (
          <Text dimColor>
            {finished ? 'Done. Press Esc to return.' : 'Esc cancel'}
          </Text>
        )}
      </Box>
    </Box>
  );
}
