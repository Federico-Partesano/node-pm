# node-pm — Design Document

**Date:** 2026-05-15
**Status:** Draft (pending user approval)

## Overview

`node-pm` is a TUI-first npm package for managing local Node.js project repositories. It targets a single user workflow: a developer who keeps many cloned Git repos under a common root and needs fast bulk operations — clone, pull, install, run scripts — across them. The motivating scenario is post-format restoration: re-clone every project from a portable manifest in seconds.

The tool ships as a global CLI (`pm`) with two surfaces:

- **TUI** (default): lazygit/k9s-style interactive interface built with Ink.
- **CLI**: scriptable subcommands for automation and dotfiles workflows.

Both surfaces share a single core engine.

## Goals

- Bulk clone, pull, status, install, and script execution across selected projects with progress feedback.
- Portable manifest synced via GitHub Gist so the project list survives a machine wipe.
- Auto-detect package manager per project from lockfile (npm / pnpm / yarn / bun).
- Live Git status (dirty / ahead / behind) without manual refresh.
- Multi-script live tailing in the TUI.
- Zero credential management: shell out to the user's existing `git` config (SSH agent, gh credential helper).

## Non-Goals

- Not a Git client replacement (no commit, branch, merge UI — use lazygit).
- Not a polyglot project manager (Node only — detected via `package.json`).
- Not a remote-execution tool (local machine only).
- Not a generic process supervisor (long-running scripts run in-session, not daemonized).

## Stack

- **Language:** TypeScript (strict).
- **Runtime:** Node 20+.
- **TUI:** Ink + ink-spinner, ink-progress-bar, ink-select-input, ink-text-input.
- **CLI:** Commander.
- **Git:** simple-git (wraps shell `git`).
- **Process spawn:** execa.
- **Concurrency:** p-queue.
- **Validation:** zod.
- **GitHub API:** octokit.
- **Secrets:** keytar (OS keychain).
- **FS atomic write:** write-file-atomic.
- **Tests:** Vitest + ink-testing-library + memfs.
- **Build:** tsup (single ESM bundle with shebang).
- **CI:** GitHub Actions; release via changesets.

## Architecture

Three layers, strict separation:

```
Frontend (TUI Ink + CLI Commander)
        ↓
Core engine (pure TS, no UI deps)
        ↓
Adapters (simple-git, execa, fs/promises, octokit, keytar)
```

Core modules emit events through a shared `TaskQueue`. TUI subscribes and renders progress; CLI subscribes and prints lines. No frontend logic lives in core; no core logic lives in frontends.

### Core modules

Each module is a single focused file with a small public API.

| Module           | File                  | Responsibility                                                  |
| ---------------- | --------------------- | --------------------------------------------------------------- |
| `ManifestStore`  | `src/core/manifest.ts`| Load/save/validate manifest JSON; atomic writes; CRUD projects. |
| `ProjectScanner` | `src/core/scanner.ts` | Walk root 2 levels deep, detect `.git`, derive name/group/url.  |
| `GitOps`         | `src/core/git.ts`     | clone / pull / fetch / status; streams progress.                |
| `PackageManager` | `src/core/pm.ts`      | Detect pm from lockfile; install; run script (returns child).   |
| `ScriptRunner`   | `src/core/runner.ts`  | Spawn long-running scripts; handles for stdout/stderr/kill.     |
| `GistSync`       | `src/core/sync.ts`    | Push/pull manifest to/from GitHub Gist; fallback to local file. |
| `TaskQueue`      | `src/core/queue.ts`   | Concurrency-bounded queue; emits unified progress events.       |

### Public API surfaces (signatures)

```ts
// ManifestStore
load(): Promise<Manifest>
save(m: Manifest): Promise<void>
addProject(p: Project): Promise<void>
removeProject(name: string, group: string): Promise<void>
list(filter?: { group?: string; tag?: string }): Project[]
resolvePath(p: Project): string

// ProjectScanner
scan(root: string): Promise<DiscoveredProject[]>

// GitOps
clone(url: string, dest: string): AsyncIterable<Progress>
pull(path: string): Promise<PullResult>
status(path: string): Promise<GitStatus>
fetch(path: string): Promise<void>

// PackageManager
detect(projectPath: string): PMName
install(projectPath: string, opts?: InstallOpts): AsyncIterable<Progress>
runScript(projectPath: string, script: string): ChildProcess

// ScriptRunner
spawn(project: Project, script: string): RunHandle
// RunHandle = { id, status, stdout$, stderr$, kill(): void }

// GistSync
push(manifest: Manifest): Promise<{ gistId: string; url: string }>
pull(gistId: string): Promise<Manifest>

// TaskQueue
class TaskQueue extends EventEmitter {
  constructor(concurrency: number)
  add<T>(name: string, fn: (signal: AbortSignal) => Promise<T> | AsyncIterable<Progress>): Promise<T>
  // events: 'task:start', 'task:progress', 'task:done', 'task:error', 'queue:drain'
}
```

## Manifest schema

Location: `$XDG_CONFIG_HOME/node-pm/projects.json` (default `~/.config/node-pm/projects.json`).

```json
{
  "version": 1,
  "root": "~/documents/projects",
  "concurrency": 5,
  "sync": {
    "gistId": "abc123...",
    "lastSync": "2026-05-15T10:30:00Z"
  },
  "projects": [
    {
      "name": "repo-blessed",
      "group": "PERSONALE",
      "url": "git@github.com:user/repo-blessed.git",
      "defaultBranch": "main",
      "tags": ["wip"],
      "scripts": { "favorites": ["dev", "test"] }
    }
  ]
}
```

Rules:

- `path` is derived at runtime as `${root}/${group}/${name}` — never stored.
- `version` enables forward-compatible migrations.
- `tags` are optional, used by TUI filters.
- `scripts.favorites` is a manual list (no full `package.json` scan needed).
- Tokens (GitHub) are stored in OS keychain via keytar — **never** in the JSON.
- The whole file is validated with zod on load; corrupted manifest → backup `.bak` + prompt.

## Filesystem layout

Single configurable root (default `~/documents/projects`). Projects live two levels deep:

```
<root>/<group>/<repo>/
e.g. ~/documents/projects/PERSONALE/repo-blessed/
```

`group` is the parent directory name. Scanner derives it from the path; clone uses `<root>/<group>/<name>` as destination.

## CLI surface

Binary: `pm` (with alias `node-pm`).

```
pm                                          # opens TUI (default)
pm init                                     # create empty manifest, prompt for root
pm scan [--root <path>]                     # populate manifest from filesystem
pm list [--group X] [--tag Y] [--json]      # tabular output
pm add <url> [--group X]                    # add single project
pm rm <name>
pm clone [<name>...] [--all] [--group X]    # bulk clone
pm pull  [<name>...] [--all] [--group X]    # bulk pull
pm status [--all] [--json]                  # git status table
pm install [<name>...] [--all]
pm run <script> [<name>...] [--all]         # bulk script (no streaming UI; use TUI)
pm sync push                                # push manifest to gist
pm sync pull <gistId>                       # pull manifest from gist
pm config set|get <key>                     # concurrency, root, etc.
```

Every command supports `--json` for machine-readable output. Exit codes: `0` ok, `1` failure, `2` partial failure (some tasks failed in bulk op).

## TUI surface

Layout (3 panels + 2 bottom panels, lazygit-style):

```
┌─ Groups (15%) ─┬─ Projects (45%) ──────────┬─ Detail (40%) ──┐
│ > PERSONALE  3 │ [ ] repo-blessed   ●dirty │ Path: ~/...     │
│   ISAB       8 │ [x] repo-foo       ↑2     │ Branch: main    │
│   OSS        2 │ [x] repo-bar       clean  │ Remote: git@... │
│                │                            │ PM: pnpm        │
├────────────────┴─────────────────┬──────────┤ Scripts:        │
│ Tasks                            │  Logs    │  • dev          │
│ ▶ pull repo-foo  ████░░ 60%      │  ...     │  • test         │
│ ✓ install repo-bar               │          │  • build        │
└──────────────────────────────────┴──────────┘
[?]help [tab]panel [space]select [a]all [p]pull [c]clone [i]install [r]run [s]status [g]gist [q]quit
```

Panels:

1. **Groups** — list with project count. Selection filters Projects panel.
2. **Projects** — multi-select checkboxes. Status badges: `●dirty` / `↑n ahead` / `↓n behind` / `clean` / `⚠missing` (not cloned).
3. **Detail** — info on focused project; quick-pick of favorite scripts.
4. **Tasks** — bottom-left, live queue with progress bars.
5. **Logs** — bottom-right, tail of active script. Tab cycles between running scripts.

Keybindings (vim-flavored):

- `j/k ↑↓` navigate, `h/l ←→` change panel, `tab` next panel.
- `space` toggle select, `a` select all visible, `A` clear all.
- `/` fuzzy filter, `Esc` clear filter.
- `p` pull selected, `c` clone selected, `i` install, `s` refresh status.
- `r` run script (opens favorites menu).
- `K` kill task in queue.
- `g` gist menu (push / pull).
- `?` help overlay, `q` quit (warn if tasks in flight).

Background refresh: every 30s a low-priority `git fetch` runs across all cloned repos to update ahead/behind counts without pulling.

## Concurrency & task flow

- `TaskQueue` uses `p-queue` with a configurable limit (default 5).
- I/O-bound ops (git, npm install) run in the queue.
- Long-running scripts (e.g. `dev`) run **outside** the queue via `ScriptRunner` and are not concurrency-limited.
- Each task receives an `AbortSignal`. Killing from TUI aborts the queue task and sends `SIGTERM` to its child process.
- Progress reporting:
  - Clone: parsed from `git clone --progress` stderr.
  - Install: parsed from package manager stdout where possible (pnpm has the best output).
  - Pull / fetch: spinner only (no reliable percent).

## Sync flow (GitHub Gist)

1. `pm sync push` — serializes manifest, scrubs any secrets (no tokens in JSON anyway), creates or updates gist via octokit, stores `gistId` and `lastSync` in manifest.
2. `pm sync pull <id>` — fetches gist, validates with zod, writes to local manifest path.
3. Conflict policy: `pull` warns and requires confirmation if local manifest was modified after `lastSync`.
4. Token: prompted on first `sync` use, stored in OS keychain via keytar with scope `gist`.
5. Fallback: if octokit fails (network down, token revoked), `push` writes `./node-pm.backup.json` in the current working directory and surfaces a warning.

## Error handling

Custom error classes in `src/shared/errors.ts`:

```
NodePMError (base)
├─ ManifestError
├─ GitError
├─ PMError       (package manager)
├─ ScannerError
└─ SyncError
```

Each carries `code: string` (machine-readable) and optional `cause: Error`. Frontends decide rendering:

- **CLI:** `console.error` formatted, exit code per `code`.
- **TUI:** toast notification (3s auto-dismiss); failed tasks remain expandable in the Tasks panel.

Bulk operation policy: failures are isolated per task. The queue continues; a final summary reports `X ok, Y failed`. Process exit code becomes `2` if any failed.

Manifest corruption: file moved to `projects.json.bak.<timestamp>`, user is prompted (repair manually vs recreate empty).

Network failures during sync are non-blocking for local operations.

## Repository structure

```
src/
├─ core/              # pure engine
│  ├─ manifest.ts
│  ├─ scanner.ts
│  ├─ git.ts
│  ├─ pm.ts
│  ├─ runner.ts
│  ├─ sync.ts
│  └─ queue.ts
├─ cli/               # Commander commands
│  ├─ commands/
│  └─ index.ts
├─ tui/               # Ink components
│  ├─ App.tsx
│  ├─ panels/        # Groups, Projects, Detail, Tasks, Logs
│  └─ hooks/         # useManifest, useQueue, useGitStatus
├─ shared/
│  ├─ types.ts
│  ├─ errors.ts
│  └─ paths.ts        # XDG resolution
└─ index.ts           # entry: routes CLI vs TUI based on argv
test/
  ├─ core/
  ├─ cli/
  └─ tui/
docs/superpowers/specs/
package.json          # "bin": { "pm": "./dist/index.js" }
tsconfig.json
tsup.config.ts
vitest.config.ts
.github/workflows/ci.yml
```

## Testing strategy

- **Unit (core):** Vitest with `memfs` for fs and `simple-git` mocked. Coverage target ≥ 80%.
- **TUI:** `ink-testing-library` for snapshot + interaction tests on each panel and the App composition.
- **CLI integration:** spawn the built binary with `execa` against a temp directory containing fixture repos. Coverage target ≥ 60% UI.
- **CI matrix:** Node 20 + Node 22 on Ubuntu (Linux-first; macOS later).

## Distribution

- Built with `tsup` to a single ESM file with `#!/usr/bin/env node` shebang.
- Published to npm under a scoped name (`@<user>/node-pm`, scope to confirm during init).
- Install: `npm i -g @<user>/node-pm`.
- Versioning + changelog: changesets, with release workflow on tag push.

## Open questions for user review

1. npm scope/package name — to be decided before first publish.
2. Repo name on disk — keep `repo-blessed` as the working dir, or rename to `node-pm`?
3. macOS / Windows support priority — Linux-first is assumed; confirm.
4. Telemetry — none planned. Confirm.
