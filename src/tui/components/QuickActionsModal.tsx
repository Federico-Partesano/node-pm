import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Project } from '../../shared/types.js';
import { QUICK_ACTIONS, type QuickActionId, type QuickAction } from '../config/quickActions.js';

type SubStep =
  | { kind: 'menu' }
  | {
      kind: 'branches';
      loading: boolean;
      branches: string[];
      current: string | null;
      cursor: number;
      error?: string;
    }
  | {
      kind: 'scripts';
      scripts: string[];
      cursor: number;
    }
  | { kind: 'busy'; label: string }
  | { kind: 'result'; ok: boolean; message: string };

type Props = {
  project: Project | null;
  projectPath: string | null;
  onClose: () => void;
  loadBranches: () => Promise<{ branches: string[]; current: string | null }>;
  loadScripts: () => Promise<string[]>;
  onAction: (
    id: QuickActionId,
    payload?: { branch?: string; script?: string },
  ) => Promise<{ ok: boolean; message: string }>;
};

export function QuickActionsModal({
  project,
  projectPath,
  onClose,
  loadBranches,
  loadScripts,
  onAction,
}: Props) {
  const [cursor, setCursor] = useState(0);
  const [step, setStep] = useState<SubStep>({ kind: 'menu' });

  const visible = QUICK_ACTIONS.filter((a) => !a.requiresPath || !!projectPath);
  const current = visible[cursor]!;

  useInput((input, key) => {
    if (step.kind === 'busy') return;

    if (key.escape) {
      if (step.kind !== 'menu') setStep({ kind: 'menu' });
      else onClose();
      return;
    }

    if (step.kind === 'menu') {
      if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow || input === 'j') setCursor((c) => Math.min(visible.length - 1, c + 1));
      if (key.return) void runMenuItem(current);
      return;
    }

    if (step.kind === 'branches') {
      if (step.loading) return;
      if (key.upArrow || input === 'k')
        setStep({ ...step, cursor: Math.max(0, step.cursor - 1) });
      if (key.downArrow || input === 'j')
        setStep({ ...step, cursor: Math.min(step.branches.length - 1, step.cursor + 1) });
      if (key.return) {
        const branch = step.branches[step.cursor];
        if (branch) void runAction('switchBranch', { branch });
      }
      return;
    }

    if (step.kind === 'scripts') {
      if (key.upArrow || input === 'k')
        setStep({ ...step, cursor: Math.max(0, step.cursor - 1) });
      if (key.downArrow || input === 'j')
        setStep({ ...step, cursor: Math.min(step.scripts.length - 1, step.cursor + 1) });
      if (key.return) {
        const script = step.scripts[step.cursor];
        if (script) void runAction('runScript', { script });
      }
      return;
    }

    if (step.kind === 'result' && key.return) {
      onClose();
    }
  });

  async function runMenuItem(action: QuickAction) {
    if (action.id === 'switchBranch') {
      setStep({ kind: 'branches', loading: true, branches: [], current: null, cursor: 0 });
      try {
        const { branches, current } = await loadBranches();
        setStep({ kind: 'branches', loading: false, branches, current, cursor: 0 });
      } catch (err) {
        setStep({ kind: 'result', ok: false, message: (err as Error).message });
      }
      return;
    }
    if (action.id === 'runScript') {
      try {
        const scripts = await loadScripts();
        if (scripts.length === 0) {
          setStep({ kind: 'result', ok: false, message: 'No scripts in package.json' });
          return;
        }
        setStep({ kind: 'scripts', scripts, cursor: 0 });
      } catch (err) {
        setStep({ kind: 'result', ok: false, message: (err as Error).message });
      }
      return;
    }
    await runAction(action.id);
  }

  async function runAction(
    id: QuickActionId,
    payload?: { branch?: string; script?: string },
  ) {
    setStep({ kind: 'busy', label: id });
    try {
      const res = await onAction(id, payload);
      setStep({ kind: 'result', ok: res.ok, message: res.message });
    } catch (err) {
      setStep({ kind: 'result', ok: false, message: (err as Error).message });
    }
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1} width={64}>
      <Box>
        <Text bold color="cyanBright">
          ⚡ Quick actions
        </Text>
        {project && (
          <>
            <Text dimColor>  · </Text>
            <Text color="yellow">{project.group}/{project.name}</Text>
          </>
        )}
      </Box>

      {step.kind === 'menu' && (
        <Box flexDirection="column" marginTop={1}>
          {visible.map((a, i) => {
            const cur = i === cursor;
            return (
              <Box key={a.id} flexDirection="column">
                <Box>
                  <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
                  <Text bold={cur} color={cur ? 'whiteBright' : undefined}>
                    {a.icon} {a.label}
                  </Text>
                </Box>
                {cur && (
                  <Box paddingLeft={4}>
                    <Text dimColor>{a.description}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓/jk nav · Enter run · Esc close</Text>
          </Box>
        </Box>
      )}

      {step.kind === 'branches' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyanBright">Switch branch</Text>
          {step.loading && <Text dimColor>loading branches…</Text>}
          {!step.loading && step.branches.length === 0 && (
            <Text color="yellow">No branches found.</Text>
          )}
          {!step.loading &&
            step.branches.map((b, i) => {
              const cur = i === step.cursor;
              const isCurrent = b === step.current;
              return (
                <Box key={b}>
                  <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
                  <Text color={isCurrent ? 'green' : undefined} bold={cur}>
                    {isCurrent ? '* ' : '  '}
                    {b}
                  </Text>
                </Box>
              );
            })}
          <Box marginTop={1}>
            <Text dimColor>Enter checkout · Esc back</Text>
          </Box>
        </Box>
      )}

      {step.kind === 'scripts' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyanBright">Run npm script</Text>
          {step.scripts.map((s, i) => {
            const cur = i === step.cursor;
            return (
              <Box key={s}>
                <Text color={cur ? 'cyanBright' : 'gray'}>{cur ? '❯ ' : '  '}</Text>
                <Text bold={cur}>{s}</Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>Enter run · Esc back</Text>
          </Box>
        </Box>
      )}

      {step.kind === 'busy' && (
        <Box marginTop={1}>
          <Text color="cyan">running {step.label}…</Text>
        </Box>
      )}

      {step.kind === 'result' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={step.ok ? 'green' : 'red'}>
            {step.ok ? '✓ ' : '✗ '}
            {step.message}
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Enter close</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
