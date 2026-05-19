import React from 'react';
import { Box, Text } from 'ink';
import type { GitStatus, PMName, Project } from '../../shared/types.js';
import { Panel } from '../components/Panel.js';
import { ProjectSnapshotsCard } from '../components/ProjectSnapshotsCard.js';
import { ProjectHealthCard } from '../components/ProjectHealthCard.js';
import type { SnapshotIndexEntry } from '../hooks/useSnapshotsIndex.js';
import type { ProjectHealth } from '../hooks/useProjectHealth.js';
import type { HealthChecksByProject } from '../hooks/useHealthChecks.js';

type Props = {
  project: Project | null;
  path: string | null;
  pmName: PMName | null;
  status?: GitStatus | null;
  snapshots?: SnapshotIndexEntry[];
  snapshotsLoading?: boolean;
  health?: ProjectHealth | null;
  healthLoading?: boolean;
  healthChecks?: HealthChecksByProject;
};

export const Detail = React.memo(DetailImpl);
function DetailImpl({
  project,
  path,
  pmName,
  status = null,
  snapshots = [],
  snapshotsLoading = false,
  health = null,
  healthLoading = false,
  healthChecks = {},
}: Props) {
  if (!project) {
    return (
      <Panel title="Detail" accent="green">
        <Text dimColor>No project selected</Text>
      </Panel>
    );
  }
  const favs = project.scripts?.favorites ?? [];
  const tags = project.tags ?? [];
  return (
    <Panel
      title="Detail"
      subtitle={`${project.group}/${project.name}`}
      accent="green"
    >
      {/* Identity / Location / Git collapsed into a compact block */}
      <Field label="Remote" value={project.url} color="white" />
      <Field label="Path" value={path ?? '—'} color="white" />
      <Box>
        <Text dimColor>PM </Text>
        <Text color="yellow">{pmName ?? '—'}</Text>
        <Text dimColor>  ·  Branch </Text>
        <Text color="cyan">{status?.branch ?? project.defaultBranch ?? '—'}</Text>
        <Text dimColor>  ·  </Text>
        {status?.exists === false ? (
          <Text color="red">missing on disk</Text>
        ) : (
          <>
            <Text color={status?.dirty ? 'yellow' : 'green'}>
              {status?.dirty ? 'dirty' : 'clean'}
            </Text>
            {status && status.ahead > 0 && (
              <>
                <Text> </Text>
                <Text color="green">↑{status.ahead}</Text>
              </>
            )}
            {status && status.behind > 0 && (
              <>
                <Text> </Text>
                <Text color="red">↓{status.behind}</Text>
              </>
            )}
          </>
        )}
      </Box>
      {tags.length > 0 && (
        <Box>
          <Text dimColor>Tags </Text>
          {tags.map((t, i) => (
            <Text key={t}>
              {i > 0 && <Text dimColor>, </Text>}
              <Text color="magenta">#{t}</Text>
            </Text>
          ))}
        </Box>
      )}
      {favs.length > 0 && (
        <Box>
          <Text dimColor>Favs </Text>
          {favs.map((s, i) => (
            <Text key={s}>
              {i > 0 && <Text dimColor>, </Text>}
              <Text color="cyan">{s}</Text>
            </Text>
          ))}
        </Box>
      )}

      <ProjectHealthCard
        health={health}
        loading={healthLoading}
        checks={healthChecks}
      />
      <ProjectSnapshotsCard entries={snapshots} loading={snapshotsLoading} />
    </Panel>
  );
}

type FieldProps = { label: string; value: string; color?: string };
function Field({ label, value, color }: FieldProps) {
  return (
    <Box>
      <Text dimColor>{label} </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}
