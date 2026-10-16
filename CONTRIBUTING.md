# Contributing

Thanks for taking the time to contribute. CC Island's core logic is plain JavaScript with no framework; only the expanded panel is written in Svelte and bundled with Vite. `npm run build` runs automatically on `npm install` and `npm start`, so getting started is still quick.

## Development setup

Requirements: Windows 10/11, Node.js 18 or newer, and Claude Code.

```bash
git clone <your-fork-url> cc-island
cd cc-island
npm install
npm start
```

To test with real hook events, install the hooks into your Claude Code settings. This edits `~/.claude/settings.json` (a backup is written next to it):

```bash
npm run install-hooks
```

Remove them again with `npm run uninstall-hooks`.

## Project layout

| File | Purpose |
| --- | --- |
| `main.js` | Electron main process: local HTTP server, session state, tray menu, window visibility |
| `hook.js` | Claude Code hook script; forwards events to the app and relays permission decisions |
| `preload.js` | Secure bridge between the main process and the page (`window.ccApi`) |
| `island.js` | Reusable `DynamicIsland` component: state machine, sizing, timers, interaction |
| `renderer.js` | App-specific UI: maps session data to island states and renders panels |
| `src/full/` | Svelte sources of the expanded panel (sidebar, session detail, today, settings), bundled to `dist/full.js` |
| `vite.config.mjs` | Vite/Svelte build config for the expanded panel (IIFE output for `file://` loading) |
| `lib/` | `usage.js` + `usage-worker.js` (token usage from transcripts), `calendar.js` (iCal), `system.js` (volume/brightness watcher) |
| `i18n.js` | English and Turkish strings and the `t()` / `plural()` helpers |
| `icons.js` | Inline SVG icons |
| `media.js` / `media.ps1` | Spotify (Windows media session) watcher |
| `native/cc-helper.cpp` | Native helper (`npm run build:native` → `bin/cc-helper.exe`): media, system indicators, focus, full-screen detection, reply-to-terminal |
| `lib/helper.js` | Starts the native helper, or the PowerShell scripts when it is missing |
| `lib/agents.js` | Hook adapters for Codex CLI, Gemini CLI and Cursor |
| `lib/rules.js` | Approval rules (pattern matching, chained-command guard) |
| `lib/history.js` | Completed-task history (`history.json` in user data) |
| `lib/wincal.js` / `wincal.ps1` | Windows calendar events and focus sessions |
| `pet.js` / `assets/pets/` | Animated mascot states |
| `src/full/` | Svelte full view (`npm run build:ui` → `ui/`) |
| `install-hooks.js` | Adds or removes the hooks in `~/.claude/settings.json` |

## Guidelines

- **Keep the island component generic.** `island.js` must not know about Claude Code or Spotify. App-specific logic belongs in `renderer.js`.
- **Add every user-facing string to both languages.** Use `L('key')` in the renderer or `T('key')` in the main process, and add the key to both `en` and `tr` in `i18n.js`.
- **No new runtime dependencies** unless there is a strong reason. Core logic uses plain JavaScript; only the expanded panel depends on Svelte + Vite as dev dependencies.
- **Keep the app local.** Do not add network calls to third-party services without discussing it first in an issue.
- Match the existing code style: 2-space indentation, single quotes, semicolons.

## Pull requests

1. Open an issue first for larger changes.
2. Keep pull requests focused on one change.
3. Describe what you changed and how you tested it (Windows version, Claude Code version, and so on).
4. Add an entry under `[Unreleased]` in `CHANGELOG.md`.

## Reporting bugs

Please include your Windows version, the CC Island version, what you expected, what happened, and steps to reproduce. If the bug involves a visual glitch, a screenshot or short recording helps a lot.
