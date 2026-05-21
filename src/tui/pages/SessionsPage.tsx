import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/Panel.js';
import { SessionPane } from '../components/SessionPane.js';
import type { Session } from '../../shared/types.js';
import { useSessionRun } from '../hooks/useSessionRun.js';

type Props = {
  width: number;
  height: number;
  sessions: Session[];
  loading: boolean;
  resolveProjectPath: (ref: string) => string;
  onExit: () => void;
  onRemove?: (id: string) => Promise<void> | void;
};

export function SessionsPage({
  width,
  height,
  sessions,
  loading,
  resolveProjectPath,
  onExit,
  onRemove,
}: Props) {
  const run = useSessionRun(resolveProjectPath);
  const [cursor, setCursor] = useState(0);
  const [focusedPane, setFocusedPane] = useState<number>(0);
  const active = sessions[cursor] ?? null;

  const panes = useMemo(
    () => (active ? active.terminals.map((t) => t.name) : []),
    [active],
  );

  useInput(async (input, key) => {
    if (key.escape) {
      if (run.state.running) {
        run.stop();
        return;
      }
      onExit();
      return;
    }

    if (!run.state.running) {
      if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow || input === 'j')
        setCursor((c) => Math.min(sessions.length - 1, c + 1));
      else if (key.return && active) void run.start(active);
      else if (input === 'd' && active && onRemove) await onRemove(active.id);
      return;
    }

    // running mode
    const digit = parseInt(input, 10);
    if (!Number.isNaN(digit) && digit >= 1 && digit <= panes.length) {
      setFocusedPane(digit - 1);
      return;
    }
    if (input === 'k' && panes[focusedPane]) await run.kill(panes[focusedPane]!);
    if (input === 'r' && panes[focusedPane]) await run.restart(panes[focusedPane]!);
  });

  const sidebarWidth = 28;

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyanBright">🖥  Sessions</Text>
        <Text dimColor>   ↑↓ navigate · Enter run · d delete · Esc back</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Box width={sidebarWidth} flexDirection="column" marginRight={1}>
          <Panel title="Saved" accent="magenta" flexGrow={1}>
            {loading && <Text dimColor>loading…</Text>}
            {!loading && sessions.length === 0 && (
              <Box flexDirection="column">
                <Text color="yellow">No sessions yet.</Text>
                <Text dimColor>Create one with</Text>
                <Text dimColor>pm session create</Text>
              </Box>
            )}
            {!loading &&
              sessions.map((s, i) => {
                const cur = i === cursor;
                return (
                  <Box key={s.id}>
                    <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
                    <Text bold={cur}>{s.id}</Text>
                    <Text dimColor>  ({s.terminals.length}t)</Text>
                  </Box>
                );
              })}
          </Panel>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {!run.state.running && !run.state.allDone && active && (
            <Panel title={active.label} subtitle={active.id} accent="cyan" flexGrow={1}>
              {active.description && (
                <Box marginBottom={1}>
                  <Text dimColor>{active.description}</Text>
                </Box>
              )}
              <Text bold>Terminals ({active.terminals.length})</Text>
              {active.terminals.map((t) => (
                <Text key={t.name}>
                  <Text color="cyan">• {t.name}</Text>
                  <Text dimColor>  [{t.projectRef}]  </Text>
                  <Text>{t.cmd}</Text>
                </Text>
              ))}
              <Box marginTop={1}>
                <Text dimColor>Enter to run · d to delete</Text>
              </Box>
            </Panel>
          )}

          {!run.state.running && !run.state.allDone && !active && (
            <Panel title="—" accent="cyan" flexGrow={1}>
              <Text dimColor>Select a session on the left.</Text>
            </Panel>
          )}

          {(run.state.running || run.state.allDone) && active && (
            <Box flexDirection="column" flexGrow={1}>
              <Box marginBottom={1}>
                <Text bold color={run.state.allDone ? 'yellow' : 'green'}>
                  {run.state.allDone ? '✓ all-done' : '▶ running'}
                </Text>
                <Text dimColor>   1..9 focus pane · k kill · r restart · Esc stop</Text>
              </Box>
              <Box flexDirection="row" flexGrow={1}>
                {active.terminals.map((t, i) => {
                  const ts = run.state.terminals.get(t.name);
                  if (!ts) return null;
                  return (
                    <Box key={t.name} flexGrow={1} marginRight={i === active.terminals.length - 1 ? 0 : 1}>
                      <SessionPane state={ts} focused={i === focusedPane} />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
