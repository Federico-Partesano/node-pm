import React from 'react';
import { Box, Text } from 'ink';
import type { GitStatus, PMName, Project } from '../../shared/types.js';
import { Panel } from '../components/Panel.js';
import { ProjectSnapshotsCard } from '../components/ProjectSnapshotsCard.js';
import { ProjectHealthCard } from '../components/ProjectHealthCard.js';
import type { SnapshotIndexEntry } from '../hooks/useSnapshotsIndex.js';
import type { ProjectHealth } from '../hooks/useProjectHealth.js';

type Props = {
  project: Project | null;
  path: string | null;
  pmName: PMName | null;
  status?: GitStatus | null;
  snapshots?: SnapshotIndexEntry[];
  snapshotsLoading?: boolean;
  health?: ProjectHealth | null;
  healthLoading?: boolean;
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
      <Section title="Identity">
        <Field label="Group " value={project.group} color="yellow" />
        <Field label="Name  " value={project.name} color="white" />
        <Field label="Remote" value={project.url} color="white" />
        {tags.length > 0 && (
          <Box>
            <Text dimColor>Tags   </Text>
            {tags.map((t, i) => (
              <Text key={t}>
                {i > 0 && <Text dimColor>, </Text>}
                <Text color="magenta">#{t}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Section>

      <Section title="Location">
        <Field label="Path  " value={path ?? '—'} color="white" />
        <Field label="PM    " value={pmName ?? '—'} color="yellow" />
      </Section>

      <Section title="Git">
        <Field
          label="Branch"
          value={status?.branch ?? project.defaultBranch ?? '—'}
          color="cyan"
        />
        <Box>
          <Text dimColor>State  </Text>
          {status?.exists === false ? (
            <Text color="red">missing on disk</Text>
          ) : (
            <>
              <Text color={status?.dirty ? 'yellow' : 'green'}>
                {status?.dirty ? 'dirty' : 'clean'}
              </Text>
              {status && (status.ahead > 0 || status.behind > 0) && (
                <>
                  <Text dimColor>  ·  </Text>
                  {status.ahead > 0 && <Text color="green">↑{status.ahead}</Text>}
                  {status.ahead > 0 && status.behind > 0 && <Text> </Text>}
                  {status.behind > 0 && <Text color="red">↓{status.behind}</Text>}
                </>
              )}
            </>
          )}
        </Box>
      </Section>

      <Section title="Favorite scripts">
        {favs.length === 0 && <Text dimColor>  none</Text>}
        {favs.map((s) => (
          <Text key={s}>
            <Text color="cyan">  ▸ </Text>
            {s}
          </Text>
        ))}
      </Section>

      <ProjectHealthCard health={health} loading={healthLoading} />
      <ProjectSnapshotsCard
        entries={snapshots}
        loading={snapshotsLoading}
      />
    </Panel>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        ─ {title}
      </Text>
      {children}
    </Box>
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
