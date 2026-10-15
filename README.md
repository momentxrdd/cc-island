<p align="center">
  <img src="assets/logo-v3.svg" width="150" alt="CC Island logo">
</p>

<p align="center">
  <b>A Dynamic Island-style overlay for Claude Code on Windows.</b><br>
  See what your Claude Code sessions are doing, approve permissions without switching windows, and control Spotify, all from a small capsule at the top of your screen.
</p>

<p align="center">
  <a href="README.tr.md">Türkçe</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

---

## Screenshots

> Screenshots use sample data.

<table>
  <tr>
    <td align="center"><img src="assets/screenshots/compact.png" width="330" alt="Working session in the capsule"><br><sub>Working session in the capsule</sub></td>
    <td align="center"><img src="assets/screenshots/peek.png" width="330" alt="Hover list of all sessions"><br><sub>Hover list of all sessions</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/screenshots/permission.png" width="330" alt="Permission request with approve / deny"><br><sub>Permission request with approve / deny</sub></td>
    <td align="center"><img src="assets/screenshots/full.png" width="330" alt="Full view with diffs and tasks"><br><sub>Full view with diffs and tasks</sub></td>
  </tr>
</table>

## Features

- **Live session status.** Each Claude Code session is listed with its project name, state (working, awaiting approval, done) and the tool it is running right now.
- **Permission approvals.** When Claude Code asks for permission, the island expands with the command or edit it wants to run. Allow, deny, "always allow" (when Claude Code suggests a rule) or hand it off to the terminal. Keyboard shortcuts: `Ctrl+Alt+Y` to allow, `Ctrl+Alt+N` to deny.
- **Notifications.** Short, animated alerts when a session finishes, needs your input, or hits an error. A success/error state shows what happened.
- **Full session view.** Click the island to see tool activity with inputs, diffs and output, Claude's latest message, the task list from `TodoWrite`, the conversation, token usage and the files that were touched.
- **Spotify.** A now-playing card with album art, a progress bar you can click to seek, and previous / play-pause / next buttons. Track changes show a short notification.
- **Automatic.** The island starts when a Claude Code session starts, hides when no session is active, and quits itself after a while when it was started that way.
- **English and Turkish.** Follows your system language by default; you can change it from the tray menu.
- **Accessible motion.** Animations can follow the Windows "Show animations" setting, or be turned off from the tray menu.

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org/) 18 or newer
- [Claude Code](https://claude.com/claude-code)
- Optional: the Spotify desktop app, for the music card

## Installation

Prebuilt Windows download: [Releases](https://github.com/momentxrdd/cc-island/releases/latest). Unzip it, run `CC Island.exe`, then install the hooks as described below (the hooks need [Node.js](https://nodejs.org/)).


```bash
git clone https://github.com/momentxrdd/cc-island.git
cd cc-island
npm install
npm run install-hooks
```

`npm run install-hooks` adds CC Island's hooks to `~/.claude/settings.json`. Before writing, it saves a backup next to the file as `settings.json.ccisland.bak`. Restart any Claude Code sessions that were already open so they pick up the hooks.

To start the island manually:

```bash
npm start
```

You do not need to keep it running yourself. Once the hooks are installed, the island launches when a new Claude Code session starts.

### Uninstall

```bash
npm run uninstall-hooks
```

This removes only CC Island's hook entries and leaves the rest of your settings untouched. Then delete the project folder.

## How it works

```
Claude Code ──hooks──▶ hook.js ──HTTP 127.0.0.1:47321──▶ main.js ──IPC──▶ renderer (island UI)
                                    ▲                       │
                                    └──── permission reply ◀┘

Spotify ──Windows media session──▶ media.ps1 ──▶ media.js ──▶ main.js
```

- Claude Code runs the hooks defined in `~/.claude/settings.json` on each event (session start, prompt, tool use, permission request, notification, stop, session end).
- `hook.js` forwards each event to the island's local server on `127.0.0.1`. For permission requests it waits for your decision and returns it to Claude Code.
- The Spotify card reads the Windows media session through a small PowerShell helper, so it works with the desktop app without any API key or login.

## Privacy

- Everything stays on your machine. The island talks only to a server bound to `127.0.0.1`, and makes no network requests of its own.
- To show conversations and token counts, it reads the transcript files Claude Code already writes locally (the path arrives in the hook payload).
- Settings are stored in Electron's user data folder (`%APPDATA%\cc-island\settings.json`).

## Settings

Use the tray icon (right-click):

| Menu | Options |
| --- | --- |
| Language | Automatic (system), English, Türkçe |
| Animations | Always on, Follow Windows setting, Off |

Demo: show all states plays through every island state so you can see how they look.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Y` | Allow the oldest pending permission request |
| `Ctrl+Alt+N` | Deny the oldest pending permission request |

These only work while a permission request is pending.

## Troubleshooting

- **The island does not appear.** Check that the hooks are installed (`npm run install-hooks`) and that the session was started after that. Hooks are read when a session starts.
- **Permission approvals fall back to the terminal.** The island was not running when the request came in. Start it with `npm start`, or open a new session so it auto-starts.
- **No Spotify card.** Only the Spotify desktop app is detected. The Windows media controls must show Spotify (the volume flyout lists it when it is playing).
- **Port in use.** The island uses port `47321`. If another program uses it, set `CC_PORT` to a different number before starting, and make the same change in the environment that runs the hooks.
- **Animations look stuck.** Check the "Animations" setting in the tray menu. "Follow Windows setting" disables motion when Windows "Show animations" is off.

## Project structure

See [CONTRIBUTING.md](CONTRIBUTING.md#project-layout) for a file-by-file overview.

## Limitations

- Windows only. The Spotify integration relies on the Windows media session APIs.
- Only one Spotify instance is followed. Other music apps and browser players are not shown.
- The island shows only the primary monitor.

## Trademarks

CC Island is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic. The mascot used in the logo and in the interface is a Claude Code asset; please check Anthropic's brand guidelines before reusing it in your own project.

## License

[MIT](LICENSE)
