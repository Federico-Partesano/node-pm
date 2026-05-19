# Project Snapshot — Design Spec

**Status:** Draft
**Date:** 2026-05-19
**Author:** node-pm (Federico Partesano)

## Goal

Add a snapshot feature to node-pm that captures the *working state* of selected projects into a portable on-disk artifact, and a corresponding restore operation that rehydrates that state into a fresh clone — including the current commit, branch, uncommitted tracked changes, untracked files, gitignored files (except `node_modules/`), and stashes.

Restore must produce a working tree that is byte-equivalent to the original at snapshot time, including large binary files (200 MB+ uncommitted assets are an explicit target).

## Non-goals

- Snapshotting node-pm config or manifest (already covered by `pm export/import`).
- Auto-publishing snapshots to GitHub Gists. Snapshots may contain `.env` secrets and must remain on the local filesystem unless the user explicitly chooses to share them.
- Incremental snapshots across distinct snapshot artifacts. (Intra-snapshot dedupe is provided by content-addressed blobs.)
- Submodule support.
- Git LFS object capture.

## User stories

1. As a developer about to wipe my machine, I select N projects in the TUI and create a snapshot. Hours later on a fresh machine I run `pm snapshot restore <file>` and resume work exactly where I left off — same branch, same commit, same uncommitted changes, same `.env`, same large uncommitted media files.
2. As a developer experimenting on multiple repos, I snapshot a working state, try a destructive refactor, and restore the snapshot if the experiment fails.
3. As a developer sharing a reproducible bug state with a teammate, I export a snapshot of one project and send it.

## Approach

**Snapshot = delta over the git tree, not a full working-dir dump.**

For each selected project the snapshot stores only what cannot be reconstructed from `git clone + git checkout + git reset --hard`:

- Remote URL, current branch name, current HEAD SHA — to position the clone.
- `git diff HEAD` — tracked-file modifications not yet committed (stored as a UTF-8 patch).
- Untracked files (those `git ls-files --others --exclude-standard` returns).
- Gitignored files (`git ls-files --others --ignored --exclude-standard`), **except any path inside `node_modules/`**.
- Stash list — each stash as a patch from `git stash show -p --include-untracked`.

Restore clones the repo, checks out the branch, hard-resets to the captured HEAD (which reconstructs all tracked file contents), then applies the tracked diff, writes the captured files, and applies the stash patches.

### Why a single `.npmsnap` zip file (not inline JSON, not a loose directory)

The initial design considered base64-encoding all file content inline in a single JSON file. This breaks down at scale:

- 200 MB file → ~270 MB base64 string. `JSON.parse` loads the whole document into memory; both create and restore would consume gigabytes of RAM and stall.
- A single JSON is opaque to inspect for large snapshots.
- No dedupe between identical files (e.g. the same `.env` referenced by two projects).

A loose directory layout would solve all three problems but creates its own pain: half-written snapshots if the process is killed mid-write, awkward sharing, no obvious way to scan the filesystem for "all snapshots I have lying around".

The chosen layout is a **single file with the custom extension `.npmsnap`**, internally a **ZIP archive** (`STORE` mode — no compression, since most snapshot content is either already compressed binary like PNG/MP4 or small text patches) containing:

```
2026-05-19-143007-mybackup.npmsnap   (ZIP)
├── snapshot.json                    # metadata + refs (sha256) to blobs
└── blobs/
    ├── a3f5…e9.bin                  # filename = sha256(content)
    ├── 7b21…02.bin
    └── …
```

This gives us all the properties we want:

- **Single-file artifact:** atomic on disk, trivial to copy, share, or back up. `find ~ -name "*.npmsnap"` enumerates every snapshot on the machine — including ones the user has moved or forgotten.
- **Streaming create:** the engine pipes each file through a sha256 hash stream into a zip entry as it goes; no file is ever held fully in memory.
- **Streaming restore via random access:** ZIP's central directory means we can read `snapshot.json` cheaply, then open a `ReadStream` for any single blob entry without extracting the rest of the archive. This is the property tar.gz does not offer.
- **Dedup:** identical files across projects share a single blob entry.
- **Inspectability:** `unzip -p snap.npmsnap snapshot.json` prints the metadata. `unzip -l snap.npmsnap` lists everything.
- **No double compression:** PNG/MP4/already-zipped content stays at its natural size; the archive overhead is just the zip metadata.

Libraries: [`yazl`](https://www.npmjs.com/package/yazl) for streaming writes and [`yauzl`](https://www.npmjs.com/package/yauzl) for random-access reads. Both are mature, dependency-light, and pure JS (no native build step).

Tracked diffs and stash patches stay inline as strings in `snapshot.json` — they are bounded and frequently small.

A `--no-zip` escape hatch is provided that writes the same internal layout as a plain directory next to the `.npmsnap`-bearing one. This is for advanced debugging only; the default and the recommended path is the single-file archive.

## Schema (zod, declared in `src/shared/types.ts`)

```ts
export const BlobRefSchema = z.object({
  path: z.string(),              // relative to the project root
  blob: z.string().regex(/^[a-f0-9]{64}$/), // sha256 hex; corresponds to blobs/<sha256>.bin
  size: z.number().int().nonnegative(),
  mode: z.string().optional(),   // POSIX mode as octal string, e.g. "0644" / "0755"
});

export const StashEntrySchema = z.object({
  message: z.string(),
  patch: z.string(),
  includesUntracked: z.boolean(),
});

export const ProjectSnapshotSchema = z.object({
  name: z.string(),
  group: z.string(),
  url: z.string(),
  branch: z.string(),                          // may be a short SHA if HEAD was detached
  head: z.string(),                            // 40-char SHA1
  trackedDiff: z.string(),                     // '' if working tree is clean vs HEAD
  untrackedFiles: z.array(BlobRefSchema),
  gitignoredFiles: z.array(BlobRefSchema),    // never contains paths inside node_modules/
  stashes: z.array(StashEntrySchema),
  warnings: z.array(z.string()).optional(),    // per-project soft errors captured during create
});

export const SnapshotSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  projects: z.array(ProjectSnapshotSchema),
});
```

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  TUI: SnapshotPage          CLI: pm snapshot create/restore    │
│       (picker + actions)         (names | --all)               │
└──────────────────┬─────────────────────┬───────────────────────┘
                   │                     │
                   ▼                     ▼
        ┌──────────────────────────────────────────┐
        │  SnapshotEngine  (src/core/snapshot.ts)  │
        │   create(projects, root)  → AsyncIterable<SnapshotEvent> │
        │   restore(snap, root, onConflict) → AsyncIterable<SnapshotEvent> │
        └────────┬───────────────────┬─────────────┘
                 │                   │
                 ▼                   ▼
       ┌──────────────────┐  ┌──────────────────────────┐
       │  GitOps (esteso) │  │  BlobStore  (new module) │
       │  headSha, diff,  │  │  putStream(absPath)→Ref  │
       │  stash*, apply*  │  │  getStream(ref,dest)     │
       │                  │  │  sha256 streaming        │
       └──────────────────┘  └──────────────────────────┘
                 │
                 ▼
       ┌────────────────────────────────────────────────────┐
       │  <snapshotDir>/<ts>[-<label>].npmsnap   (ZIP)      │
       │      snapshot.json                                 │
       │      blobs/<sha256>.bin                            │
       │  (--no-zip → same layout as a loose directory)     │
       └────────────────────────────────────────────────────┘
```

TUI and CLI are thin facades over `SnapshotEngine`. The engine emits a typed stream of events; the UI layer renders them.

### Modules

| Module | Responsibility |
|---|---|
| `src/core/snapshot.ts` | `SnapshotEngine.create/restore` orchestrators. No I/O beyond delegating to GitOps + BlobStore. Pure event emitter. |
| `src/core/git.ts` (extended) | Adds `headSha`, `currentBranch`, `diffHead`, `listUntracked`, `listIgnored`, `listStashes`, `stashPatch`, `applyDiff`, `applyStashPatch`, `resetHard`, `checkoutBranch`, `lsRemoteHas`. |
| `src/core/blob-store.ts` (new) | Content-addressed blob store. Two backends: `ZipBlobStore` (default, writes/reads via yazl/yauzl) and `DirBlobStore` (`--no-zip` path, writes to `<snapshotRoot>/blobs/`). Both stream file → sha256 + dest in one pass and return `BlobRef`. |
| `src/core/snapshot-scanner.ts` (new) | Walks a root directory looking for `*.npmsnap` files (used by `pm snapshot list --global`). Skips `node_modules`, `.git`, and any path the user has excluded. |
| `src/shared/types.ts` (extended) | Adds the four zod schemas above. |
| `src/shared/errors.ts` (extended) | Adds `SnapshotError` with the codes in the Error handling table. |
| `src/cli/commands/snapshot.ts` (new) | Registers `pm snapshot create/restore/list`. |
| `src/tui/pages/SnapshotPage.tsx` (new) | Two-mode page: `create` (project picker → live progress) and `restore` (snapshot picker → project picker → live progress). |
| `src/tui/pages/SettingsPage.tsx` (new, minimal) | Single field `snapshotDir`. Persisted into the manifest. |
| `src/tui/components/snapshot/` (new) | `ProgressBar.tsx`, `ProjectRow.tsx`, `LogTail.tsx`, `OverallBar.tsx`. |

### Streaming I/O — the load-bearing detail

Both create and restore must operate without ever holding a file fully in memory:

- **`BlobStore.putStream(absPath)`** creates `fs.createReadStream(absPath)`, pipes it through a `crypto.createHash('sha256')` transform, and writes to the backing store:
  - `ZipBlobStore`: pipes into a yazl entry named `blobs/<sha256>.bin` (the hash is known after the read closes — until then the entry is buffered to a tmp file and renamed into the zip stream once the sha is known). yazl writes the zip with `STORE` compression so already-compressed binaries do not pay a second pass.
  - `DirBlobStore`: writes to `blobs/.tmp-<rand>.bin` then `fs.rename`s to `blobs/<sha256>.bin`.
  Returns `{ blob, size, mode }`. If a blob with the same sha256 already exists in this snapshot, the temp is unlinked (dedup hit).
- **Progress reporting** is byte-based: every N bytes (e.g. 1 MB) the engine emits a `file-progress` event with `{ current, total, path }`. The TUI renders both per-file and per-project byte progress.
- **`BlobStore.getStream(ref, destAbsPath)`** is the inverse:
  - `ZipBlobStore` uses yauzl's random-access `openReadStream(entry)` to read `blobs/<sha256>.bin` directly out of the zip without extracting the rest.
  - `DirBlobStore` streams the on-disk file.
  In both cases the dest write uses temp+rename so a failure mid-stream never leaves a corrupted dest. POSIX mode is restored with `fs.chmod` afterwards.

This is what enables 200 MB+ uncommitted assets to round-trip cleanly.

### Event stream

```ts
type SnapshotEvent =
  | { kind: 'project-start'; project: Project }
  | { kind: 'phase'; project: Project; phase: SnapshotPhase }
  | { kind: 'file-progress'; project: Project; current: number; total: number; path: string }
  | { kind: 'log'; level: 'info' | 'warn'; message: string }
  | { kind: 'project-done'; project: Project; bytes: number; warnings: number }
  | { kind: 'project-error'; project: Project; error: string }
  | { kind: 'done'; snapshot: Snapshot; path: string };

type SnapshotPhase =
  | 'diff' | 'untracked' | 'gitignored' | 'stash' | 'finalizing'           // create
  | 'clone' | 'checkout' | 'reset' | 'apply-diff' | 'write-files' | 'apply-stash'; // restore
```

The TUI translates events into progress bars (per-project + overall) and a tailed log panel. Warn-level logs are highlighted yellow. The CLI prints one line per `log` event.

### Config

`snapshotDir` is a new field in the manifest schema, default `~/.config/node-pm/snapshots/` (matches the existing convention used by `~/.config/node-pm/projects.json`). Tilde is expanded the same way the existing `root` field is. Configurable via:

- `pm config set snapshotDir <path>`
- TUI `SettingsPage` (new minimal page accessible from `HomePage`).

### Concurrency

Both `create` and `restore` use the existing `Queue` (`src/core/queue.ts`) with `manifest.concurrency` workers. Multiple projects may be `in-progress` simultaneously. The `onConflict` prompt during restore is serialised behind a mutex so prompts cannot overlap in the TUI.

## Data flow — create

1. Resolve target path: `<snapshotDir>/<ts>[-label].npmsnap` (default) or `<snapshotDir>/<ts>[-label]/` (`--no-zip`). Open the appropriate `BlobStore` backend.
2. Validate each project's path exists and contains `.git`. Otherwise emit `project-error` and continue.
3. Per project (concurrent up to `manifest.concurrency`):
    1. `phase: 'diff'` — `head = git.headSha`, `branch = git.currentBranch`, `trackedDiff = git.diffHead`. Log byte count.
    2. `phase: 'untracked'` — `git.listUntracked` → for each path, emit `file-progress` while `BlobStore.putStream` streams the file into the backing store. Append `BlobRef` to project entry.
    3. `phase: 'gitignored'` — `git.listIgnored(repo, ['node_modules'])` → same loop. The `node_modules/` exclusion is enforced unconditionally inside `listIgnored`.
    4. `phase: 'stash'` — `git.listStashes` → for each stash, capture `stashPatch` and message.
4. `phase: 'finalizing'` — assemble `Snapshot`, write `snapshot.json` into the archive (or to the directory) as the last entry. Close the zip / flush the directory. **The zip path is written as `<target>.tmp.npmsnap` and `fs.rename`d to `<target>.npmsnap` only on successful close,** so a killed process never leaves a half-written `.npmsnap` that `pm snapshot list` would surface.
5. Emit `done` with the final `.npmsnap` path (or directory path for `--no-zip`).

Cancellation (Esc / SIGINT): a `cancelToken` is checked between events and inside the blob-write loop. On cancel the partial `<target>.tmp.npmsnap` is left on disk and **not** renamed; the user can delete it or pass `--resume` (out of scope for v1) in the future. `done` is not emitted. For the `--no-zip` path the partial directory is left intact.

## Data flow — restore

1. Resolve input. If the path ends in `.npmsnap`, open it with yauzl in random-access mode and instantiate a `ZipBlobStore` reader. Otherwise treat the path as a snapshot directory and instantiate a `DirBlobStore` reader. **No temp extraction.** Both backends expose the same `snapshot.json` lookup and `getStream(ref, dest)` interface.
2. Parse `snapshot.json`, validate via `SnapshotSchema`. Reject `version !== 1`. Throw before touching any project destination.
3. Per project (concurrent up to `manifest.concurrency`):
    1. `dest = path.join(rootDir, project.group, project.name)`. If `dest` exists, await `onConflict(project) → 'skip' | 'overwrite' | 'abort'`.
        - `abort` throws `E_SNAP_CONFLICT_ABORT` and stops the entire restore.
        - `skip` emits `project-done` (skipped) and continues with the next project.
        - `overwrite` removes `dest` recursively.
    2. `phase: 'clone'` — stream `git.clone(url, dest)` events as logs.
    3. `phase: 'checkout'` — if the branch exists in the remote, create a tracking branch; otherwise `git checkout -b <branch>` creates a local-only branch (warn log).
    4. `phase: 'reset'` — `git.resetHard(dest, head)`. If the SHA is not resolvable (commit not in remote), emit `project-error` (`E_SNAP_COMMIT_MISSING`) and continue to the next project.
    5. `phase: 'apply-diff'` — if `trackedDiff !== ''`, run `git apply --3way`. **Conflicts are not fatal:** markers remain in the working tree, a warning is logged, and we continue.
    6. `phase: 'write-files'` — for each `BlobRef` in `untrackedFiles ++ gitignoredFiles`, emit `file-progress` while `BlobStore.getStream` streams `blobs/<sha256>.bin` into `dest/<path>`.
    7. `phase: 'apply-stash'` — apply stash patches in reverse capture order. The stash entry message is preserved in the log but the patch does not recreate it as an actual stash entry (recreating stashes would require `git stash store` with a tree+index pair; out of scope).
4. Final summary: `M ok, N failed, K warnings`.

## TUI layout — create

```
┌─ Creating snapshot ─────────────────────────────────────────────┐
│ Overall:  [████████░░░░░░░░░░] 40%   2/5 projects · 184 MB      │
├─────────────────────────────────────────────────────────────────┤
│ ✓ work/api-server      done · 4.2 MB · 0 warn                   │
│ ✓ work/web-app         done · 138 MB · 1 warn                   │
│ ◐ personal/cli-tool    [██████░░░░░] 60% assets/hero.png 124MB/200MB │
│ · personal/dotfiles    pending                                  │
│ · personal/notes       pending                                  │
├─ Log ───────────────────────────────────────────────────────────┤
│   work/web-app: captured 12 untracked files                     │
│   work/web-app: WARN broken symlink src/old-link, skipped       │
│   work/web-app: captured stash@{0} "WIP login"                  │
│   personal/cli-tool: diff HEAD (842 bytes)                      │
│   personal/cli-tool: streaming assets/hero.png (200 MB)         │
├─────────────────────────────────────────────────────────────────┤
│ Esc cancel                                                      │
└─────────────────────────────────────────────────────────────────┘
```

Row icons: `·` pending, `◐` in-progress (animated spinner), `✓` done, `✗` error. Progress bar is plain ASCII (`█`/`░`) — no new dependency. Warn lines render in yellow.

Restore page uses the same layout, with `clone → checkout → reset → apply-diff → write-files → apply-stash` phases shown in the per-row status. The conflict prompt is rendered as an inline modal panel above the log.

## CLI surface

```
pm snapshot create  [names...] [--all] [--group X] [--out <path>] [--label <s>] [--no-zip]
pm snapshot restore <path>     [--only <name>] [--on-conflict skip|overwrite|abort]
pm snapshot list               [--global | --scan <root>]
```

- Default `--out` resolves to `<snapshotDir>/<YYYYMMDD-HHMMSS>[-<label>].npmsnap`.
- `--no-zip` writes a loose directory `<…>/snapshot.json + blobs/…` instead of the zip. Mostly for debugging.
- `restore <path>` accepts either a `.npmsnap` archive or a directory containing `snapshot.json`.
- `list` without flags shows entries in `snapshotDir` (newest first). `--global` scans `$HOME`. `--scan <root>` scans an arbitrary root for `*.npmsnap`.
- Without `--on-conflict`, the CLI prompts per-project on stdin (same semantics as the TUI).

## Error handling — "never fatal unless we truly cannot continue"

The aggressive policy: a snapshot run should almost always finish, even degraded. Only three conditions stop the run:

| Code | Phase | Behaviour |
|---|---|---|
| `E_SNAP_WRITE_OUTPUT` | create | fatal — out of disk space or snapshot dir not writable |
| `E_SNAP_PARSE` / `E_SNAP_VERSION_UNSUPPORTED` | restore | fatal — thrown before any destination is touched |
| `E_SNAP_CONFLICT_ABORT` | restore | fatal — user explicitly chose to abort |

Everything else is **soft**: emitted as a `log` event with `level: 'warn'`, recorded in the project's `warnings` array, and the run continues:

| Condition | Phase | Effect |
|---|---|---|
| Project path missing / not a git repo | create | `project-error`, skip project, continue others |
| `git diff` / `git stash` command fails | create | warn, capture what we can, continue project |
| Single file unreadable (EACCES, broken symlink) | create | warn, skip the file, continue project |
| Single file too large to fit on snapshot disk | create | warn, skip the file, continue project (write target out of space ≠ source readable) |
| Clone fails | restore | `project-error`, continue others |
| Branch not in remote | restore | warn, create local-only branch, continue |
| HEAD SHA not resolvable | restore | `project-error` (`E_SNAP_COMMIT_MISSING`), continue others |
| `git apply --3way` leaves conflict markers | restore | warn, leave markers in working tree, continue |
| Individual blob write fails | restore | warn, continue with next blob |
| Stash patch fails to apply | restore | warn, continue with next stash |

No hard size limits. There is no `--no-size-limit` escape hatch because there is nothing to escape — the engine streams everything.

### Security

- `pm snapshot create` never auto-publishes. Snapshots are written to the local filesystem only.
- Capture warns (log line) when a path matches a sensitive pattern (`.env*`, `*.pem`, `*.key`, `*credentials*`, `id_rsa*`). It does not block; the user has explicitly opted in to "total backup".
- README documents that snapshots may contain secrets and must not be pushed to public Gists.

### Cancellation

- `cancelToken` checked between events and inside the streaming blob loop.
- Create + cancel → partial snapshot directory left on disk for inspection; no `done` event.
- Restore + cancel → already-processed projects remain on disk in whatever partial state they reached; the summary lists incomplete projects.

## Cross-platform

The feature must work on macOS, Linux, and Windows. The implementation is pure JavaScript / TypeScript on Node (no native modules), but several platform differences need explicit handling.

| Aspect | macOS / Linux | Windows | Handling |
|---|---|---|---|
| POSIX file modes (exec bit) | preserved via `fs.chmod` | NTFS has ACLs, not POSIX modes; `fs.chmod` only toggles the read-only attribute | Always capture `mode` into `BlobRef`. On restore, call `fs.chmod` best-effort and treat any failure as a warn, not an error. |
| Symlinks | first-class | require admin or Developer Mode to create | On create, untracked symlinks are skipped with a warn (already in the soft-error policy). On restore the snapshot will not contain symlinks to recreate. Tracked symlinks are reconstructed by Git itself. |
| Zip entry path separator | `/` | `/` (required by the ZIP spec) | Use `path.posix.join` for zip entry keys and blob lookup keys. Use Node's `path.join` for filesystem operations. Conversion happens at the BlobStore boundary. |
| Case sensitivity | macOS HFS+ default = case-insensitive; ext4 = case-sensitive | NTFS = case-insensitive by default | On restore, if two BlobRefs in the same project differ only by case (e.g. `Foo.txt` vs `foo.txt`), the second write would clobber the first on case-insensitive filesystems. Detect collisions and emit a warn; the second file is skipped. |
| Illegal filenames | virtually none | `< > : " \| ? *` reserved, plus reserved names `CON`, `PRN`, `AUX`, `NUL`, `COM1..9`, `LPT1..9` | On restore, validate each path against the target platform's rules. Illegal paths are skipped with a warn. |
| Long paths | not an issue | 260-character `MAX_PATH` historically; modern Node + Win10+ with LongPathsEnabled supports longer | Any `ENAMETOOLONG`/`EACCES` from the streaming write is converted to a warn and skipped. The user can enable Windows long-path support to recover. |
| Line endings | LF | CRLF when `core.autocrlf=true` (Git default on Windows) | `trackedDiff` is whatever `git diff HEAD` produced. `git apply --3way` on the restore side respects the destination repo's `core.autocrlf` setting, so the diff applies cleanly when both sides use Git's default. A known limitation when source and target machines disagree on `core.autocrlf`. |
| Git CLI | system `git` | `git-for-windows` or WSL `git` | All git interaction goes through `execa('git', ...)` / `simple-git`. The implementation does not assume Unix-only behaviour. |
| Pure JS deps | `yazl`, `yauzl`, `simple-git`, `execa` | same | All four are pure JS, no native build step. |
| Default `snapshotDir` | `~/.config/node-pm/snapshots/` | `%USERPROFILE%\.config\node-pm\snapshots\` | Matches the existing convention used elsewhere in the codebase (`~/.config/node-pm/projects.json`). Tilde expansion via the same helper already in `src/shared/`. |

### CI

The test suite runs on Linux locally and in CI today. Add Windows + macOS jobs to the existing GitHub Actions workflow with the integration roundtrip test gated to skip if `git` is not on `PATH`. The 200 MB streaming test stays gated behind an env flag to keep CI minutes reasonable.

## Testing

### Unit (vitest)

- `src/core/snapshot.test.ts` — `SnapshotEngine` with mocked `GitOps` + `BlobStore`. Verifies event ordering for create and restore, ProjectSnapshot shape, conflict-prompt routing, cancellation, "never fatal" policy.
- `src/core/git.test.ts` — extensions exercised against a tmp git repo fixture. Covers diff/untracked/ignored listing, stash capture, `applyDiff` 3-way behaviour.
- `src/core/blob-store.test.ts` — streaming put/get against both backends (`DirBlobStore`, `ZipBlobStore`), sha256 correctness, dedup hit (second put of the same content does not duplicate), atomic temp+rename, byte-exact roundtrip including a 10 MB random binary, exec-bit preservation. (The 200 MB roundtrip lives in the gated integration test.)

### Integration

- `test/integration/snapshot-roundtrip.test.ts` — build a real fixture repo with a feature branch, uncommitted tracked changes, an untracked file, a gitignored `.env`, a binary untracked file (10 MB random bytes for CI speed), and one stash. Create snapshot → restore into a second tmp root → assert: same HEAD SHA, byte-exact file contents (tracked + untracked + gitignored), correct branch, stash patch applied. Asserts `node_modules/` never appears in the blob set. Runs with a smaller fixture by default; a separate slow test with a 200 MB file is gated behind an env flag.
- `test/integration/snapshot-cli.test.ts` — exercises `pm snapshot create/restore` end-to-end (writes to a tmp `snapshotDir`). Covers both the default `.npmsnap` zip path and the `--no-zip` directory path, plus `pm snapshot list --scan <root>` discovery.

### TUI

- `test/tui/pages/SnapshotPage.test.tsx` — drives the engine via a mock event stream; asserts progress rows, log tail content, conflict prompt rendering, final summary, warn highlight.
- `test/tui/components/snapshot/ProgressBar.test.tsx` — width rendering at 0 / 33 / 67 / 100 percent.

### Edge cases explicitly covered

- Repo clean — `trackedDiff === ''`, no untracked, no stash → minimal valid ProjectSnapshot.
- Untracked binary (PNG) — byte-exact roundtrip via streaming.
- 200 MB uncommitted file (gated test) — completes without RAM spike, byte-exact restore.
- Broken symlink in untracked — file skipped with warn, project succeeds.
- Stash that includes untracked files (`--include-untracked`).
- Detached HEAD → `branch` is the short SHA, restore lands in detached state.
- `node_modules/` present on disk → never appears in `gitignoredFiles`.
- Restore over a dirty divergent HEAD → `git apply --3way` leaves conflict markers, no throw.
- Snapshot file with `version: 2` → schema parse rejects, fatal before any fs change.
- Two projects with identical `.env` content → single blob entry in the archive.
- `.npmsnap` zip round-trip vs `--no-zip` directory round-trip → both produce identical restored working trees.
- Killed mid-create → no `.npmsnap` appears in `pm snapshot list`; only a leftover `*.tmp.npmsnap` does.

## Open follow-ups (out of scope for this spec)

- Sharing snapshots via Gist (a follow-up command `pm snapshot push/pull`).
- Differential snapshots (capture only changes vs a previous snapshot).
- Submodule support.
- Git LFS object capture for repos that use Git LFS.

## Build sequence

1. Add `yazl` and `yauzl` (with their `@types`) to `package.json`.
2. Add zod schemas + `SnapshotError` codes to `src/shared`.
3. Implement `BlobStore` with `DirBlobStore` and `ZipBlobStore` backends, with unit tests (streaming, sha256, dedup, atomic write, byte-exact roundtrip including a 10 MB random binary).
4. Extend `GitOps` with the new primitives, with unit tests against a fixture repo.
5. Implement `SnapshotEngine.create` with engine-level unit tests.
6. Implement `SnapshotEngine.restore`.
7. Implement `snapshot-scanner.ts` (filesystem walk for `*.npmsnap`).
8. Wire CLI `pm snapshot create/restore/list`.
9. Build the TUI progress components (`ProgressBar`, `ProjectRow`, `LogTail`, `OverallBar`).
10. Build `SnapshotPage` (create mode first, then restore mode).
11. Build minimal `SettingsPage` exposing `snapshotDir`.
12. Add the roundtrip integration test once create + restore are both online.
13. Update README with the new commands, the `.npmsnap` extension, and the security caveat about secrets.
