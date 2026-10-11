// Adds CC Island hooks to ~/.claude/settings.json (makes a backup first). Use --remove to uninstall.
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = path.join(os.homedir(), '.claude', 'settings.json');
const hookPath = path.join(__dirname, 'hook.js');
const command = `node "${hookPath}"`;
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'];
const isOurs = (h) => typeof h.command === 'string' && h.command.includes('hook.js') && h.command.includes('cc-island');
const remove = process.argv.includes('--remove');

let settings = {};
if (fs.existsSync(file)) {
  const text = fs.readFileSync(file, 'utf8');
  settings = text.trim() ? JSON.parse(text) : {};
  fs.copyFileSync(file, file + '.ccisland.bak');
}
settings.hooks = settings.hooks || {};

for (const ev of EVENTS) {
  const groups = (settings.hooks[ev] || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  if (!remove) groups.push({ hooks: [{ type: 'command', command, ...(ev === 'PermissionRequest' ? { timeout: 600 } : {}) }] });
  if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log(remove ? 'Hooks removed.' : 'Hooks installed: ' + EVENTS.join(', '));
console.log('Backup: ' + file + '.ccisland.bak');
