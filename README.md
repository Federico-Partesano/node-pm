# node-pm

TUI-first manager for local Node project repositories. Bulk clone, pull, install, run scripts. lazygit-style interface. Manifest synced via GitHub Gist so it survives a machine wipe.

## Install

    npm i -g node-pm

## Quick start

    pm init                  # create empty manifest
    pm scan                  # discover existing repos under ~/Documents/projects
    pm                       # open the TUI

## CLI commands

    pm init [--root <path>]
    pm scan [--root <path>]
    pm list [--group X] [--tag Y] [--json]
    pm add <url> [--group X]
    pm rm <name>
    pm clone [<name>...] [--all] [--group X]
    pm pull  [<name>...] [--all] [--group X]
    pm status [--all] [--json]
    pm install [<name>...] [--all]
    pm run <script> [<name>...] [--all]
    pm sync push
    pm sync pull <gistId>
    pm config set|get <key>          # root | concurrency | token | snapshotDir
    pm snapshot create [<name>...] [--all] [--group X] [--out PATH] [--label S] [--no-zip]
    pm snapshot restore <path>       [--only <name>] [--on-conflict skip|overwrite|abort]
    pm snapshot list                 [--global | --scan <root>]
    pm session create <id> --label S --terminal "name=group/proj:cmd"...
    pm session list | show <id> | remove <id> | run <id>

## TUI keybindings

| Key | Action |
| --- | --- |
| `j` / `k` / `↑` / `↓` | Navigate |
| `tab` | Next panel |
| `space` | Toggle select |
| `a` / `A` | Select all / Clear all |
| `p` / `c` / `i` | Pull / Clone / Install selected |
| `s` | Refresh status |
| `r` | Run favorite script on cursor project |
| `g` | Gist menu |
| `?` | Help overlay |
| `q` | Quit |

## Manifest

Stored at:

- Linux: `~/.config/node-pm/projects.json`
- macOS: `~/Library/Preferences/node-pm/projects.json`
- Windows: `%APPDATA%\node-pm\Config\projects.json`

Sync to a private GitHub Gist with `pm sync push` / `pm sync pull <gistId>`. The token is stored in your OS keychain.

## Snapshots

`pm snapshot` captures the live working state of selected projects — current commit, branch, uncommitted tracked changes, untracked files, gitignored files (except `node_modules/`), and stashes — into a single `.npmsnap` archive (a plain zip with content-addressed blobs). `pm snapshot restore` rehydrates a fresh clone byte-exact, including large binary files (200 MB+ uncommitted assets are supported via streaming I/O).

Snapshots live under `~/.config/node-pm/snapshots/` by default. Configure a different path with `pm config set snapshotDir <path>` or from the TUI Settings page.

**Security caveat:** snapshots may contain `.env` files and other secrets that live outside git. Treat `.npmsnap` files as sensitive — do **not** push them to public Gists or repositories.

## Sessions

A *session* is a named set of long-running terminal commands, one per project. From the TUI's Sessions page (or `pm session run <id>`) every terminal is spawned in parallel and its output streams live into a multi-pane log view. Inspired by VS Code's Terminal Keeper but built on top of node-pm's manifest, with no native dependencies.

Define a session once via CLI:

```sh
pm session create dev --label "Dev stack" \
  --terminal "api=oss/api:npm run dev" \
  --terminal "web=oss/web:npm run dev"
pm session run dev          # foreground, ctrl-c kills the whole tree
```

In the TUI: Home → Sessions → pick a session → Enter. `1..9` focuses a pane, `k` kills it, `r` restarts it, `Esc` stops the session.

**v1 limits:** foreground only — closing the page or exiting the TUI terminates the child tree. No PTY (commands run with `shell: true`, append-only log streaming). No attach/detach. Perfect for `dev`, `test --watch`, `docker compose up`; not for interactive REPLs.

**Trust model:** session commands are executed via the system shell exactly as written. Treat the manifest the same way you'd treat `package.json scripts`. Do not put secrets in `terminals[].env` — they would be persisted in cleartext in the manifest and uploaded by `pm sync push`.

## Platforms

Linux, macOS, Windows. Requires Node 20+ and `git` on `PATH`.

## License

MIT
