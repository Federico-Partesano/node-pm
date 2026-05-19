import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ProjectHealth } from '../hooks/useProjectHealth.js';
import type {
  HealthCheckKind,
  HealthCheckState,
  HealthChecksByProject,
} from '../hooks/useHealthChecks.js';

type Props = {
  health: ProjectHealth | null;
  loading: boolean;
  checks?: HealthChecksByProject;
};

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Text>
      <Text color={ok ? 'green' : 'gray'}>{ok ? '●' : '○'}</Text>
      <Text dimColor={!ok}> {label}</Text>
    </Text>
  );
}

const KIND_LABEL: Record<HealthCheckKind, string> = {
  lint: 'lint',
  typecheck: 'typecheck',
  test: 'test',
  build: 'build',
};

const KIND_ICON: Record<HealthCheckKind, string> = {
  lint: '🧹',
  typecheck: '🔎',
  test: '🧪',
  build: '📦',
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function CheckRow({
  kind,
  script,
  state,
}: {
  kind: HealthCheckKind;
  script?: string;
  state?: HealthCheckState;
}) {
  const status = state?.status ?? 'idle';
  const icon =
    status === 'running' ? null
    : status === 'ok' ? '✓'
    : status === 'fail' ? '✗'
    : '·';
  const color =
    status === 'ok' ? 'green'
    : status === 'fail' ? 'red'
    : status === 'running' ? 'cyan'
    : 'gray';
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={3}>
          {icon ? <Text color={color}>{icon}</Text> : <Text color="cyan"><Spinner type="dots" /></Text>}
        </Box>
        <Text>{KIND_ICON[kind]} </Text>
        <Box width={11}><Text color="cyan">{KIND_LABEL[kind]}</Text></Box>
        {!script && <Text dimColor>n/a</Text>}
        {script && status === 'idle' && (
          <Text dimColor>{`npm run ${script}`}</Text>
        )}
        {script && status === 'running' && <Text color="cyan">running…</Text>}
        {state && (state.status === 'ok' || state.status === 'fail') && (
          <>
            <Text color={state.status === 'ok' ? 'green' : 'red'}>
              {state.status === 'ok' ? 'ok' : `fail (exit ${state.exitCode})`}
            </Text>
            <Text dimColor>  · </Text>
            <Text dimColor>{fmtMs(state.durationMs)}</Text>
            {state.summary && (
              <>
                <Text dimColor>  · </Text>
                <Text>{state.summary}</Text>
              </>
            )}
          </>
        )}
      </Box>
      {state && state.status === 'fail' && state.tail && (
        <Box paddingLeft={5} flexDirection="column">
          {state.tail.split('\n').slice(-3).map((line, i) => (
            <Text key={i} color="red" dimColor>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ProjectHealthCard({ health, loading, checks = {} }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        ─ Health
      </Text>
      {loading && <Text dimColor>scanning…</Text>}
      {!loading && !health && <Text dimColor>no path resolved</Text>}
      {!loading && health && (
        <>
          <Box>
            <Text dimColor>Files </Text>
            <Text>{health.fileCount}</Text>
            <Text dimColor> · Size </Text>
            <Text>{fmtBytes(health.size)}</Text>
          </Box>
          <Box>
            <Badge ok={health.hasPackageJson} label="pkg" />
            <Text> </Text>
            <Badge ok={health.hasTsconfig} label="tsconfig" />
            <Text> </Text>
            <Badge ok={health.hasEslint} label="eslint" />
            <Text> </Text>
            <Badge ok={health.hasVitest} label="vitest" />
            <Text> </Text>
            <Badge ok={health.hasJest} label="jest" />
            <Text> </Text>
            <Badge ok={health.hasGitHooks} label="hooks" />
          </Box>
          {(['lint', 'typecheck', 'test', 'build'] as const).some(
            (k) => health.scriptHints[k],
          ) && (
            <Box flexDirection="column">
              <Text dimColor>(h=run all · l/y/t/b=single)</Text>
              <CheckRow kind="lint" script={health.scriptHints.lint} state={checks.lint} />
              <CheckRow kind="typecheck" script={health.scriptHints.typecheck} state={checks.typecheck} />
              <CheckRow kind="test" script={health.scriptHints.test} state={checks.test} />
              <CheckRow kind="build" script={health.scriptHints.build} state={checks.build} />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
