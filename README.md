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
    pm config set|get <key>          # root | concurrency | token

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

## Platforms

Linux, macOS, Windows. Requires Node 20+ and `git` on `PATH`.

## License

MIT
