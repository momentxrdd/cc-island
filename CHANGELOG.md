# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Other AI coding agents.** OpenAI Codex CLI, Gemini CLI and Cursor sessions show up next to Claude Code, each with its own label. Codex approvals work from the island. Hooks are connected per agent from Settings → AI tools, or with `node install-hooks.js --agent=<name>`.
- **Animated mascot** ([clawd-pet](https://github.com/abderrahimghazali/clawd-pet), MIT). It changes with the work being done: typing for edits, reading for searches, testing, pushing, deploying, juggling several sessions, waiting for approval, celebrating when a task finishes, sleeping when idle. Shown in the capsule, notifications, the hover list and the full view; can be turned off.
- **Reply from the island.** A composer at the bottom of each session and a Reply button on the "completed" notification send a message straight to the agent's terminal.
- **Approval rules.** Allow or block requests automatically by tool, pattern (`npm test*`, `src/*`, `https://docs.example.com/*`) and project. A ⚡ button on the permission card adds an "always allow in this project" rule. Wildcard allow rules never approve chained or redirected shell commands.
- **Task summaries and history.** The completed notification shows duration, tool count, files changed and errors. A History page keeps the last 300 tasks with search and daily totals.
- **Windows Settings-style full view** built with Svelte and fluent-svelte-extra: navigation pane, settings cards, system theme and Windows accent color (or a custom one).
- **Appearance settings:** notch or floating pill shape, notch height / width / label length, per-element corner radius, live preview.
- **Windows calendar.** Events from the accounts added to Windows (Outlook, Microsoft 365, Google, iCloud), merged with an optional iCal link. Month grid with day-by-day agenda and Join buttons.
- **Windows focus sessions.** Starting focus on the island also starts Windows focus (Do Not Disturb); a focus started from Windows shows on the island.
- **Full-screen apps.** The island hides while a game, full-screen video or presentation is running on its monitor (or shows only approvals). Exclusive full-screen games always hide it.
- **Markdown** in Claude's last message and in the conversation view.
- **Windows installer** (`npm run dist:setup`, NSIS): per-user install, shortcuts, connects the hooks on install and removes them on uninstall. Works without Node.js: hooks then run through `cc-helper.exe hook`, which starts the app executable in Node mode.
- **Context meter.** A thin bar under the capsule and in the session view shows how full the context window is; alerts at 80% and 95%.
- **5-hour window.** Usage of the current 5-hour block (cost, tokens, reset countdown), compared with your busiest block of the last 8 days.
- **Diffs for approvals.** Edit, MultiEdit, Write and Codex patches show a line-numbered, colored diff on the island card and in the full view.
- **Stuck alerts.** A notification when a tool runs longer than a set time, nothing happens for a while, or the same step repeats three times.
- **Command palette** (`Ctrl+K`, or `Ctrl+Alt+Space` from anywhere): jump to pages and sessions, message a session, approve or deny, control the timer.
- **Clock and weather.** A clock and the current weather in the idle capsule, and a forecast card on the Today page (Open-Meteo, only when a city is set).
- Per-element corner radius, multi-pending approval navigation (‹ 2/3 ›, allow / deny all), split-flap status text.
- Today panel with Pomodoro timer and Claude usage summary; calendar and timer chips in the capsule.
- System indicators for volume, brightness and battery.
- Answer `AskUserQuestion` prompts from the island.
- Settings for sounds, music source (Spotify only / any player), monitor and start with Windows.

### Changed
- The island now stays on screen when no agent is running (sleeping mascot, clock, weather) and no longer quits itself after being auto-started. The previous behavior is available as Settings → "When no agent is running" → Hide, or from the tray menu.
- **Native helper.** `bin/cc-helper.exe` (C++/WinRT, built by `npm install` when Visual Studio Build Tools are present) replaces the PowerShell media and system watchers: about 3 MB each instead of about 80 MB. Without the compiler the app falls back to the PowerShell scripts.
- The Svelte UI builds to `ui/` (`npm run build:ui`), so `npm run build` can keep using `dist/` for the portable package. The package now includes the new files and the native helper.

### Fixed
- High idle CPU: hidden views (notification, hover card, full panel) kept animating at the monitor's refresh rate. They are now suspended after fading out, and the rotating border only runs while visible (renderer about 31% → 7% of one core on a 144 Hz display).
- Hover flicker caused by resizing the transparent window between the capsule and the hover card.
- The island briefly disappeared on Alt+Tab: Windows shell windows (task switcher, Start, search, lock screen) were taken for full-screen apps. They are now ignored and full-screen changes are debounced.
- The full view could not receive keyboard input (the window was never focusable), and typing a space in a text field collapsed the island.
- Corner radius and timer sliders now save while dragging.
- Clicking the music progress bar did not seek; the play/pause icon now flips immediately.
- `uninstall-hooks` missed hooks when the project folder had a different name.

### Security
- The local server rejects browser requests (Origin header, non-JSON content type) and bodies over 2 MB.
- Links in rendered Markdown open in the default browser and only for `http`, `https` and `mailto`; raw HTML is never rendered.

## [1.0.0] - 2026-10-15

First public release.

### Added
- English and Turkish interface. Language follows the system locale by default and can be changed from the tray menu.
- Overlay states: notification, loading, progress, success, error, permission request and expanded view.
- Permission approvals from the island (Allow, Deny, Always allow, Ask in terminal) with keyboard shortcuts `Ctrl+Alt+Y` / `Ctrl+Alt+N`.
- Full session view with tool activity, diffs, command output, Claude's last message, task list, transcript and token usage.
- Spotify now-playing card with album art, progress bar, seek and playback controls (read through Windows media controls).
- Auto-launch when a Claude Code session starts, and auto-quit after sessions end.
- Reduced-motion support, with an animation setting in the tray menu.
- Portable Windows build (`npm run build`) published on the Releases page.

### Fixed
- Permission buttons no longer clip their labels in narrow overlays.
- Auto-launch works from the packaged build (the app records its own executable path for the hooks).
