# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
