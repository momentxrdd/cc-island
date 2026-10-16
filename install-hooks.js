const fs = require('fs');
const os = require('os');
const path = require('path');
const { AGENTS } = require('./lib/agents');

const home = os.homedir();
const hookPath = path.join(__dirname, 'hook.js');
const helperPath = path.join(__dirname, 'bin', 'cc-helper.exe');
const { spawnSync } = require('child_process');
const exePath = process.versions.electron ? process.execPath : '';
let nodeOnPath = null;
function hasNode() {
  if (nodeOnPath == null) { try { nodeOnPath = spawnSync('where', ['node'], { windowsHide: true }).status === 0; } catch { nodeOnPath = false; } }
  return nodeOnPath;
}
const packaged = () => !!exePath && !/[\\/]node_modules[\\/]electron[\\/]/i.test(exePath);
const cmdFor = (agent) => {
  const tail = agent === 'claude' ? '' : ` --agent=${agent}`;
  if (packaged() && !hasNode() && fs.existsSync(helperPath)) return `"${helperPath}" hook --exe "${exePath}"${tail}`;
  return `node "${hookPath}"${tail}`;
};
const norm = (s) => s.replace(/\\/g, '/').toLowerCase();
const isOurs = (h) => !!h && typeof h.command === 'string' &&
  (norm(h.command).includes(norm(hookPath)) || /cc-helper\.exe"? hook --exe/i.test(h.command) || (h.command.includes('hook.js') && h.command.includes('cc-island')));
const mine = (h) => !!h && typeof h.command === 'string' && (norm(h.command).includes(norm(hookPath)) || norm(h.command).includes(norm(helperPath) + '" hook'));

const SPEC = {
  claude: { file: path.join(home, '.claude', 'settings.json'), dir: path.join(home, '.claude'), layout: 'nested',
    events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'],
    timeout: (ev) => (ev === 'PermissionRequest' ? 600 : undefined) },
  codex: { file: path.join(home, '.codex', 'hooks.json'), dir: path.join(home, '.codex'), layout: 'nested',
    events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'],
    timeout: (ev) => (ev === 'PermissionRequest' ? 600 : 10) },
  gemini: { file: path.join(home, '.gemini', 'settings.json'), dir: path.join(home, '.gemini'), layout: 'nested',
    events: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeTool', 'AfterTool', 'Notification'],
    timeout: () => 5000, named: true },
  cursor: { file: path.join(home, '.cursor', 'hooks.json'), dir: path.join(home, '.cursor'), layout: 'flat',
    events: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'postToolUse', 'afterAgentResponse', 'stop'],
    timeout: () => 10 },
};

function read(f) {
  if (!fs.existsSync(f)) return {};
  const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Could not parse ${f}: ${e.message}\nFix the JSON and run this again. Nothing was changed.`);
  }
}

const entriesOf = (spec, list) => (spec.layout === 'flat' ? list : list.flatMap((g) => (g && g.hooks) || []));

function agentStatus(agent) {
  const spec = SPEC[agent];
  const detected = agent === 'claude' || fs.existsSync(spec.dir);
  let installed = false, error = '';
  try {
    const hooks = read(spec.file).hooks || {};
    installed = spec.events.every((ev) => entriesOf(spec, hooks[ev] || []).some(mine));
  } catch (e) { error = e.message.split('\n')[0]; }
  return { id: agent, label: AGENTS[agent].label, detected, installed, error, file: spec.file };
}

function installAgent(agent, remove = false) {
  const spec = SPEC[agent];
  if (!spec) throw new Error('Unknown agent: ' + agent);
  const f = spec.file;
  const cfg = read(f);
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.ccisland.bak');
  if (spec.layout === 'flat' && !cfg.version) cfg.version = 1;
  cfg.hooks = cfg.hooks || {};
  for (const ev of spec.events) {
    const t = spec.timeout(ev);
    let list;
    if (spec.layout === 'flat') {
      list = (cfg.hooks[ev] || []).filter((h) => !isOurs(h));
      if (!remove) list.push({ command: cmdFor(agent), ...(t ? { timeout: t } : {}) });
    } else {
      list = (cfg.hooks[ev] || [])
        .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
        .filter((g) => g.hooks.length);
      if (!remove) list.push({ hooks: [{ ...(spec.named ? { name: 'cc-island' } : {}), type: 'command', command: cmdFor(agent), ...(t ? { timeout: t } : {}) }] });
    }
    if (list.length) cfg.hooks[ev] = list; else delete cfg.hooks[ev];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
  return f;
}

const agents = () => Object.keys(SPEC).map(agentStatus);
const status = () => agentStatus('claude').installed;
const install = (remove = false) => installAgent('claude', remove);
const EVENTS = SPEC.claude.events;

module.exports = { status, install, EVENTS, agents, agentStatus, installAgent };

if (require.main === module) {
  const remove = process.argv.includes('--remove');
  const only = (process.argv.find((a) => a.startsWith('--agent=')) || '').slice(8);
  const targets = only ? [only] : agents().filter((a) => a.detected).map((a) => a.id);
  let failed = false;
  for (const a of targets) {
    try {
      const f = installAgent(a, remove);
      console.log(`${AGENTS[a] ? AGENTS[a].label : a}: ${remove ? 'hooks removed' : 'hooks installed'} (${f}, backup: .ccisland.bak)`);
    } catch (e) {
      failed = true;
      console.error(`${a}: ${e.message}`);
    }
  }
  if (failed) process.exit(1);
}
