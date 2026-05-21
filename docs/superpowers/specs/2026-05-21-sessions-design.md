# Sessions — Design Spec

**Status:** Draft
**Date:** 2026-05-21
**Author:** node-pm (Federico Partesano)

## Goal

Add a *Sessions* feature to node-pm: a session is a named collection of long-running terminal commands (one per cross-referenced project) that the user can launch with a single keystroke from the TUI or `pm session run <id>` from the CLI.

Inspired by VS Code's *Terminal Keeper* extension, but built entirely on top of node-pm's existing manifest, primitives, and Ink TUI — no VS Code dependency, no native PTY.

## Non-goals

- Interactive terminals with PTY (no `node-pty`). Output-only streaming is sufficient for the 90% case: `dev`, `build:watch`, `test --watch`, `docker compose up`, `tail -f`, etc.
- Window/pane management beyond what Ink can render (no tmux integration).
- Cross-machine session sharing. Sessions live in the local manifest and travel with `pm export` / `pm sync push` like the rest of the manifest.
- Detached background sessions surviving node-pm exit (deferred — see "Future" section).
- Automatic start on TUI launch (deferred — see "Future" section).

## User stories

1. As a developer working on a 3-service monorepo (api + web + db), I create one session `dev` with three terminals running `npm run dev` in api/, web/, and a `docker compose up` in db/. I press `s` in the TUI, pick `dev`, hit Enter, and all three start in parallel. Logs stream live in three panes.
2. As a developer testing a refactor across three repos, I create a session `tests` that runs `npm test -- --watch` in each. While I edit code, all three test runners re-run on save and I see failures in a single TUI.
3. As a developer who installs node-pm on a new machine, after running the wizard I want to recreate my standard `dev` session in two minutes via the CLI, without touching JSON.

## Approach

A **Session** is pure manifest data — a list of `TerminalSpec`s that name a project (`group/name`) and a shell command. There is no notion of a "running session on disk": sessions are *templates*, and each invocation creates a fresh process tree.

When the user invokes a session, a `SessionRunner` spawns one `execa` process per terminal with `stdio: 'pipe'`, mounts a ring buffer on each stdout/stderr, and emits a typed event stream that the TUI consumes to render N log panes.

### Why no PTY

`node-pty` provides true terminal emulation (cursor movement, color, interactive input) but:
- Native build step — breaks the "pure JS, npm install just works" property node-pm has so far.
- Major source of Windows / WSL portability bugs.
- Only matters for *interactive* commands. The target use cases (`dev`, `test --watch`, `docker compose up`) all emit append-only log lines.

`execa` with `stdio: 'pipe'` plus `readline` on stdout/stderr gives us 95% of what users need (live log streaming, exit codes, kill/restart) at zero portability cost. If a user genuinely needs interactivity, they can run the command in a real shell — node-pm is not trying to replace tmux.

### Why one session = one set of processes (not a registry)

We considered modeling running sessions as long-lived entities with IDs, attach/detach semantics, and persistence across TUI restarts. That requires:
- A daemon process or `setsid` + PID files.
- Reliable detection of stale PIDs across reboots.
- Output buffering on disk so reattach can replay.

That is its own substantial feature. For v1 we keep it strictly synchronous-with-the-TUI: opening the Sessions page launches the processes, closing the page (or exiting node-pm) kills them. The benefit: zero filesystem state to corrupt, zero zombie processes, trivially correct.

A future `pm session run --detach` mode is sketched in "Future" below and reuses the same `SessionRunner` core.

## Schema (zod, declared in `src/shared/types.ts`)

```ts
export const TerminalSpecSchema = z.object({
  name: z.string().min(1),                 // pane label, e.g. "api"
  projectRef: z.string().min(1),           // "group/name"
  cmd: z.string().min(1),                  // shell command, e.g. "npm run dev"
  cwd: z.string().optional(),              // path override (default: project path)
  env: z.record(z.string()).optional(),    // env merged on top of process.env
});
export type TerminalSpec = z.infer<typeof TerminalSpecSchema>;

export const SessionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-_]*$/),  // kebab-ish, used in CLI
  label: z.string().min(1),                              // human title
  description: z.string().optional(),
  terminals: z.array(TerminalSpecSchema).min(1),
});
export type Session = z.infer<typeof SessionSchema>;
```

`ManifestSchema` gains:

```ts
export const ManifestSchema = z.object({
  /* …existing fields… */
  sessions: z.array(SessionSchema).default([]),
});
```

Default `[]` keeps existing manifests valid.

## Runner architecture

`src/core/session-runner.ts` exposes a `SessionRunner` class with one method:

```ts
async *run(session: Session, ctx: RunContext): AsyncGenerator<SessionEvent>
```

`RunContext` carries `resolveProjectPath(projectRef) => string` and an `AbortSignal` for clean teardown.

For each terminal:
1. Resolve `cwd` (explicit `cwd` ?? project path).
2. Spawn `execa(cmd, { shell: true, cwd, stdio: 'pipe', env: { ...process.env, ...spec.env }, signal })`.
   - `shell: true` because `cmd` is a string the user wrote: `npm run dev && npm run watch` must work.
3. Attach `readline` to `stdout` and `stderr`. Each line → `event: 'line'` with `terminalName`, `stream` (`'stdout'|'stderr'`), `text`.
4. Push each line into a ring buffer (default 500 lines, per-terminal). The ring buffer is what new subscribers see when they attach mid-flight — the event stream is fire-and-forget.
5. On exit: `event: 'exit'` with `exitCode` (null if signal-killed).
6. On spawn error (binary not found, etc.): `event: 'error'` with the error message; runner does not throw.

The runner keeps a `Map<terminalName, ChildProcess>` so the TUI can call `runner.kill(name)` and `runner.restart(name)`.

### Event types

```ts
type SessionEvent =
  | { kind: 'start';   terminal: string; cmd: string; cwd: string }
  | { kind: 'line';    terminal: string; stream: 'stdout'|'stderr'; text: string }
  | { kind: 'exit';    terminal: string; code: number | null }
  | { kind: 'error';   terminal: string; error: string }
  | { kind: 'killed';  terminal: string }     // explicit user kill
  | { kind: 'all-done' };                     // every terminal exited
```

### Ring buffer

```
class RingBuffer<T> {
  constructor(private cap: number) {}
  push(x: T): void
  toArray(): T[]
}
```

500 lines × ~120 bytes/line = ~60 KB per terminal. 10 terminals = 600 KB ceiling. Acceptable.

## Cross-platform shell handling

`shell: true` on Windows uses `cmd.exe`, on POSIX uses `/bin/sh`. Users writing `&&` or `|` in their session commands need to either:
- Stick to syntax common to both shells (which `&&` and `|` are), or
- Set the platform-specific session by adding a tag/conditional (deferred — see "Future").

For v1 we document the constraint in the README and ship.

## CLI surface (`src/cli/commands/session.ts`)

```
pm session list
pm session show <id>
pm session create <id> --label "Dev stack" \
    --terminal "api=oss/api:npm run dev" \
    --terminal "web=oss/web:npm run dev"
pm session remove <id>
pm session run <id>                 # foreground, streams log lines prefixed with [api], [web], …
                                    # ctrl-c kills all and exits with code 130
```

CLI `run` uses the same `SessionRunner` as the TUI; the only difference is the renderer (line-prefixing console writer vs. multi-pane Ink).

`session create` is intentionally minimal: complex sessions are easier to edit in a JSON file (`pm export` → edit → `pm import`). The CLI is for quick one-liners.

## TUI surface

### Home menu

Add a `sessions` entry to `HomeMenuItem` after `snapshotRestore`:

```
🖥  Sessions   — run multi-project dev stacks
```

### `SessionsPage` layout

Two-column page:

```
┌─ Sessions ─────────────────┐┌─ dev — 3 terminals ──────────────────────┐
│ ❯ dev     3 terms          ││ ┌─ api ────┐┌─ web ────┐┌─ db ─────┐    │
│   tests   2 terms          ││ │ npm run  ││ vite dev ││ docker u │    │
│   ci      1 term           ││ │ … log    ││ … log    ││ … log    │    │
│                            ││ │          ││          ││          │    │
│ Enter run   n new          ││ │          ││          ││          │    │
│ e edit      d delete       ││ └──────────┘└──────────┘└──────────┘    │
└────────────────────────────┘│ 1/2/3 focus · k kill · r restart · Esc │
                              └──────────────────────────────────────────┘
```

- Left sidebar: list of saved sessions with cursor.
- Right detail (idle): description + terminals summary.
- Right detail (running): N inline panes, each tailing its terminal. Number keys focus a pane (becomes scrollable). `k` kills the focused pane, `r` restarts it. `Esc` kills the whole session and returns to sidebar.

### Pane rendering

Each pane is `Panel + LogTail` (re-use `src/tui/components/snapshot/LogTail.tsx`) bound to the runner's ring buffer for that terminal. Re-render throttle: 30fps via `requestAnimationFrame`-equivalent (`setInterval(16ms)` clearing a dirty flag).

## Edge cases & resilience

| Case | Behavior |
|---|---|
| Session references a `projectRef` not in manifest | `error` event for that terminal, other terminals start; UI shows `✗ project oss/foo not found`. Session keeps running. |
| Project path missing on disk | Same. Treated as if `cwd` does not exist. |
| Binary in `cmd` not found | `execa` rejects → `error` event; UI shows `✗ command not found`. |
| User exits TUI mid-session | `AbortSignal` triggers `SIGTERM` to every child. SIGTERM grace = 3s, then SIGKILL. |
| Terminal exits non-zero | Stays visible with red exit badge; `r` restarts it. Other terminals continue. |
| All terminals exit (success or failure) | `all-done` event; UI keeps panes visible until user closes. |
| Session has same `name` for two terminals | Rejected at zod validation when saving the manifest. |

## Security caveats

- `cmd` is executed via `shell: true`. Commands stored in the manifest run with the user's full privileges. **The manifest must be treated as code.** Same trust model as `package.json scripts`. Documented in README.
- `env` overrides are merged on top of `process.env` and visible only to the spawned child. They are persisted in the manifest in cleartext, so secrets should *not* go there — use the project's `.env` instead.
- `pm sync push` (Gist sync) currently uploads the whole manifest. We extend the existing redaction note: do not include secrets in `session.terminals[].env`.

## Tests (vitest)

- `test/core/session-runner.test.ts`:
  - Spawns `echo hi` in a single-terminal session → emits `start`, `line('hi')`, `exit(0)`, `all-done`.
  - Two terminals; second exits non-zero → first stays running, `all-done` not emitted until first also exits.
  - `kill(name)` produces `killed` event with `exitCode: null`.
  - Ring buffer caps at configured size (push 600 lines, assert 500).
- `test/core/manifest-sessions.test.ts`:
  - `addSession`, `updateSession`, `removeSession`, validation on duplicate id.
- `test/integration/session-cli.test.ts`:
  - `pm session create … && pm session list` round-trip.
- `test/tui/pages/SessionsPage.test.tsx`:
  - Renders sidebar with sessions.
  - Selecting a session and pressing Enter calls `onRun`.
  - Idle pane shows terminal summary.

## Future

- **Detached mode** (`pm session run --detach`): same runner backed by a parent process holding the children + log files in `~/.config/node-pm/sessions/<id>/`. TUI gains a "Sessions" indicator showing detached sessions and an "Attach" key.
- **Per-platform overrides**: `terminals[].when: 'win32' | 'linux' | 'darwin'`.
- **Auto-start**: `manifest.autoStartSession: string` runs that session when the TUI boots.
- **Project-scoped sessions**: a session whose terminals all run in the same project, exposed in the QuickActionsModal as "Run session here".
- **Dependency ordering**: `terminals[].dependsOn: string[]` — terminal B starts only after A emits its first stdout line (rough port readiness).
- **PTY upgrade path**: optional `node-pty` as a peerDependency; if installed, runner switches to PTY mode. Pure-JS users keep the current behavior.

## Out of scope

- Editing a session inside the TUI beyond `create` and `delete`. For now editing terminals is JSON-only (`pm export` → edit → `pm import`). A proper in-TUI editor is its own feature.
- Recording / replaying log output to disk.
- Color-aware rendering of ANSI escapes in panes. `LogTail` strips them today; we keep that behavior.
