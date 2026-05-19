import React from 'react';
import { Box, Text } from 'ink';
import type { ProjectHealth } from '../hooks/useProjectHealth.js';

type Props = {
  health: ProjectHealth | null;
  loading: boolean;
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

export function ProjectHealthCard({ health, loading }: Props) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold dimColor>
        Project health
      </Text>
      {loading && <Text dimColor>  scanning project tree…</Text>}
      {!loading && !health && <Text dimColor>  no path resolved</Text>}
      {!loading && health && (
        <>
          <Box paddingLeft={2}>
            <Text dimColor>Files </Text>
            <Text>{health.fileCount}</Text>
            <Text dimColor>  ·  Size </Text>
            <Text>{fmtBytes(health.size)}</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <Box>
              <Badge ok={health.hasPackageJson} label="package.json" />
              <Text dimColor>  </Text>
              <Badge ok={health.hasTsconfig} label="tsconfig" />
              <Text dimColor>  </Text>
              <Badge ok={health.hasEslint} label="eslint" />
            </Box>
            <Box>
              <Badge ok={health.hasVitest} label="vitest" />
              <Text dimColor>  </Text>
              <Badge ok={health.hasJest} label="jest" />
              <Text dimColor>  </Text>
              <Badge ok={health.hasGitHooks} label="git hooks" />
            </Box>
          </Box>
          {Object.keys(health.scriptHints).some((k) => (health.scriptHints as Record<string, string | undefined>)[k]) && (
            <Box paddingLeft={2} marginTop={1} flexDirection="column">
              <Text bold dimColor>
                Available checks
              </Text>
              {health.scriptHints.lint && <HintRow icon="🧹" label="lint" name={health.scriptHints.lint} />}
              {health.scriptHints.typecheck && <HintRow icon="🔎" label="typecheck" name={health.scriptHints.typecheck} />}
              {health.scriptHints.test && <HintRow icon="🧪" label="test" name={health.scriptHints.test} />}
              {health.scriptHints.coverage && <HintRow icon="📊" label="coverage" name={health.scriptHints.coverage} />}
              {health.scriptHints.build && <HintRow icon="📦" label="build" name={health.scriptHints.build} />}
              {health.scriptHints.format && <HintRow icon="✨" label="format" name={health.scriptHints.format} />}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function HintRow({ icon, label, name }: { icon: string; label: string; name: string }) {
  return (
    <Box>
      <Text>{icon} </Text>
      <Text color="cyan">{label.padEnd(10)}</Text>
      <Text dimColor>npm run </Text>
      <Text>{name}</Text>
    </Box>
  );
}
