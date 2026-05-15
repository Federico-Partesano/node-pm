import React from 'react';
import { Box, Text } from 'ink';
import type { GitStatus, PMName, Project } from '../../shared/types.js';
import type { GroupSummary } from '../panels/Groups.js';
import type { QueueTask } from '../hooks/useQueue.js';
import type { LogTab } from '../panels/Logs.js';
import type { SnapshotResult } from '../hooks/useSnapshot.js';
import { Header } from '../components/Header.js';
import { Footer, MAIN_HINTS } from '../components/Footer.js';
import { Groups } from '../panels/Groups.js';
import { Projects } from '../panels/Projects.js';
import { Detail } from '../panels/Detail.js';
import { Tasks } from '../panels/Tasks.js';
import { Logs } from '../panels/Logs.js';

type Props = {
  width: number;
  height: number;
  root: string;
  totalProjects: number;
  totalGroups: number;
  activeGroup: string | null;
  groupSummaries: GroupSummary[];
  panel: 'groups' | 'projects';
  onSelectGroup: (name: string) => void;
  visible: Project[];
  statusByName: Map<string, GitStatus>;
  selected: Set<string>;
  cursor: string | null;
  onCursor: (name: string) => void;
  onToggle: (name: string) => void;
  cur: Project | null;
  curPath: string | null;
  pmName: PMName | null;
  tasks: QueueTask[];
  logs: LogTab[];
  activeLog: string | null;
  snapshotResult: SnapshotResult | null;
};

export const MainPage = React.memo(MainPageImpl);
function MainPageImpl(p: Props) {
  return (
    <Box flexDirection="column" width={p.width} height={p.height}>
      <Header
        root={p.root}
        totalProjects={p.totalProjects}
        totalGroups={p.totalGroups}
        activeGroup={p.activeGroup}
      />
      <Box flexDirection="column" flexGrow={1}>
        <Box flexGrow={2} flexBasis={0}>
          <Box flexGrow={1} flexBasis={0} minWidth={18}>
            <Groups
              groups={p.groupSummaries}
              selected={p.activeGroup ?? ''}
              focused={p.panel === 'groups'}
              onSelect={p.onSelectGroup}
            />
          </Box>
          <Box flexGrow={2} flexBasis={0} minWidth={32}>
            <Projects
              projects={p.visible}
              statusByName={p.statusByName}
              selected={p.selected}
              cursor={p.cursor}
              focused={p.panel === 'projects'}
              onCursor={p.onCursor}
              onToggle={p.onToggle}
            />
          </Box>
          <Box flexGrow={2} flexBasis={0} minWidth={32}>
            <Detail project={p.cur} path={p.curPath} pmName={p.pmName} />
          </Box>
        </Box>
        <Box flexGrow={1} flexBasis={0}>
          <Box flexGrow={3} flexBasis={0}>
            <Tasks tasks={p.tasks} />
          </Box>
          <Box flexGrow={2} flexBasis={0}>
            <Logs tabs={p.logs} activeId={p.activeLog} />
          </Box>
        </Box>
      </Box>
      {p.snapshotResult && (
        <Box paddingX={2}>
          {p.snapshotResult.ok ? (
            <Text color="green">✓ Snapshot exported to {p.snapshotResult.path}</Text>
          ) : (
            <Text color="red">✗ Export failed: {p.snapshotResult.error}</Text>
          )}
        </Box>
      )}
      <Footer hints={MAIN_HINTS} />
    </Box>
  );
}
