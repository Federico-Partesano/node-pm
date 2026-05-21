import path from 'node:path';
import type { Command } from 'commander';
import { ManifestStore } from '../../core/manifest.js';
import { SessionRunner } from '../../core/session-runner.js';
import { SessionSchema, type Session, type TerminalSpec } from '../../shared/types.js';
import { SessionError } from '../../shared/errors.js';
import { expandHome } from '../../shared/paths.js';

function parseTerminal(spec: string): TerminalSpec {
  const eq = spec.indexOf('=');
  if (eq <= 0)
    throw new SessionError(
      `Bad --terminal "${spec}", expected name=projectRef:cmd`,
      'E_SESSION_BAD_TERMINAL',
    );
  const name = spec.slice(0, eq);
  const rest = spec.slice(eq + 1);
  const colon = rest.indexOf(':');
  if (colon <= 0)
    throw new SessionError(
      `Bad --terminal "${spec}", expected name=projectRef:cmd`,
      'E_SESSION_BAD_TERMINAL',
    );
  const projectRef = rest.slice(0, colon);
  const cmd = rest.slice(colon + 1);
  return { name, projectRef, cmd };
}

function formatSession(s: Session): string {
  const lines: string[] = [];
  lines.push(`${s.id}  —  ${s.label}`);
  if (s.description) lines.push(`  ${s.description}`);
  for (const t of s.terminals) {
    lines.push(`  • ${t.name}  [${t.projectRef}]  ${t.cmd}`);
  }
  return lines.join('\n');
}

export function registerSession(program: Command): void {
  const cmd = program.command('session').description('Manage and run multi-project sessions');

  cmd
    .command('list')
    .description('List saved sessions')
    .action(async () => {
      const store = new ManifestStore();
      const sessions = await store.listSessions();
      if (sessions.length === 0) {
        console.log('(no sessions)');
        return;
      }
      for (const s of sessions) {
        console.log(`${s.id}\t${s.label}\t(${s.terminals.length} terminals)`);
      }
    });

  cmd
    .command('show <id>')
    .description('Print a session definition')
    .action(async (id: string) => {
      const store = new ManifestStore();
      const s = await store.getSession(id);
      if (!s) {
        console.log(`Session "${id}" not found.`);
        return;
      }
      console.log(formatSession(s));
    });

  cmd
    .command('create <id>')
    .description('Create a session')
    .requiredOption('--label <s>', 'human label')
    .option('--description <s>', 'optional long description')
    .option(
      '-t, --terminal <spec>',
      'add a terminal: name=projectRef:cmd (repeatable)',
      (v: string, acc: string[]) => acc.concat(v),
      [] as string[],
    )
    .action(
      async (
        id: string,
        opts: { label: string; description?: string; terminal: string[] },
      ) => {
        if (opts.terminal.length === 0) {
          throw new SessionError(
            'At least one --terminal is required',
            'E_SESSION_NO_TERMINAL',
          );
        }
        const terminals = opts.terminal.map(parseTerminal);
        const session = SessionSchema.parse({
          id,
          label: opts.label,
          description: opts.description,
          terminals,
        });
        const store = new ManifestStore();
        await store.addSession(session);
        console.log(`Created session ${id} with ${terminals.length} terminal(s).`);
      },
    );

  cmd
    .command('remove <id>')
    .description('Remove a session')
    .action(async (id: string) => {
      const store = new ManifestStore();
      await store.removeSession(id);
      console.log(`Removed session ${id}.`);
    });

  cmd
    .command('run <id>')
    .description('Run a session in the foreground, streaming logs prefixed with [terminal]')
    .action(async (id: string) => {
      const store = new ManifestStore();
      const manifest = await store.load();
      const session = await store.getSession(id);
      if (!session) {
        console.error(`Session "${id}" not found.`);
        process.exitCode = 1;
        return;
      }
      const root = expandHome(manifest.root);
      const resolveProjectPath = (ref: string): string => {
        const [group, name] = ref.split('/');
        if (!group || !name) return root;
        return path.join(root, group, name);
      };
      const ctrl = new AbortController();
      const onSig = (): void => {
        ctrl.abort();
      };
      process.once('SIGINT', onSig);
      process.once('SIGTERM', onSig);

      const runner = new SessionRunner({ resolveProjectPath });
      for await (const ev of runner.run(session, { signal: ctrl.signal })) {
        if (ev.kind === 'start') console.log(`[${ev.terminal}] ▶ ${ev.cmd}`);
        else if (ev.kind === 'line') {
          const stream = ev.stream === 'stderr' ? process.stderr : process.stdout;
          stream.write(`[${ev.terminal}] ${ev.text}\n`);
        } else if (ev.kind === 'exit')
          console.log(`[${ev.terminal}] ✗ exit ${ev.code ?? 'null'}`);
        else if (ev.kind === 'killed') console.log(`[${ev.terminal}] ✗ killed`);
        else if (ev.kind === 'error') console.error(`[${ev.terminal}] ! ${ev.error}`);
        else if (ev.kind === 'all-done') console.log('— all terminals finished');
      }
      process.off('SIGINT', onSig);
      process.off('SIGTERM', onSig);
    });
}
