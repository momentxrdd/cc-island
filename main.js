const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, clipboard, net, shell, nativeTheme, systemPreferences } = require('electron');
const http = require('http');
const { execFile, execSync } = require('child_process');
const { MediaWatcher } = require('./media');
const { SystemWatcher } = require('./lib/system');
const WIN = require('./lib/wincal');
const HELPER = require('./lib/helper');
const { History } = require('./lib/history');
const RULES = require('./lib/rules');
const { Usage } = require('./lib/usage');
const CAL = require('./lib/calendar');
const fs = require('fs');
const path = require('path');
const I18N = require('./i18n');
const HOOKS = require('./install-hooks');
const AGENT_IDS = Object.keys(require('./lib/agents').AGENTS);

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const PORT = +process.env.CC_PORT || 47321;
const AUTO = process.argv.includes('--auto');
const QUIT_MS = +process.env.CC_QUIT_MS || 60000;
const STALE_MS = 6 * 60 * 60 * 1000;
const MAX_ACTIVITY = 60;
const MAX_BODY = 2 * 1024 * 1024;
const sessions = new Map();
const pending = new Map();
const transcriptCache = new Map();
let win, tray, nextId = 1, shortcutsOn = false, pageReady = false;
let latestMedia = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const media = new MediaWatcher((state) => {
  latestMedia = state;
  send('media', state);
});
const usage = new Usage();
const HISTORY = new History(() => path.join(app.getPath('userData'), 'history.json'), () => send('history-changed'));
const system = new SystemWatcher((change) => {
  if (change.kind === 'focus') return onWinFocus(change.active);
  if (change.kind === 'game') return onGame(change);
  if (settings.osd === 'off') return;
  send('osd', change); hold('osd', 2200);
});

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { motion: 'on', lang: 'auto', sound: 'on', media: 'spotify', display: 'primary', osd: 'on', calendarUrl: '',
  focusMin: 25, breakMin: 5, longBreakMin: 15, autoBreak: true, shape: 'notch', radius: 100, accentColor: '',
  radiusCompact: 100, radiusOverlay: 100, radiusPeek: 100, radiusFull: 100,
  notchHeight: 34, notchWidth: 104, notchLabel: 150,
  pet: 'on',
  calSystem: 'on',
  focusSync: 'on',
  gameMode: 'hide',
  rules: [] };
const SCHEMA = {
  lang: ['auto', 'en', 'tr'], motion: ['on', 'system', 'off'], sound: ['on', 'important', 'off'], media: ['spotify', 'all', 'off'],
  display: ['primary', 'cursor'], osd: ['on', 'off'], pet: ['on', 'off'], calSystem: ['on', 'off'], focusSync: ['on', 'off'], gameMode: ['hide', 'important', 'off'], autoBreak: [true, false], shape: ['notch', 'pill'],
  focusMin: { min: 5, max: 180 }, breakMin: { min: 1, max: 60 }, longBreakMin: { min: 5, max: 60 }, radius: { min: 0, max: 150 },
  notchHeight: { min: 28, max: 44 }, notchWidth: { min: 80, max: 240 }, notchLabel: { min: 60, max: 280 },
  radiusCompact: { min: 0, max: 150 }, radiusOverlay: { min: 0, max: 150 }, radiusPeek: { min: 0, max: 150 }, radiusFull: { min: 0, max: 150 },
  accentColor: 'hex',
};
function validSetting(k, v) {
  const r = SCHEMA[k];
  if (!r) return undefined;
  if (r === 'hex') return (v === '' || /^#[0-9a-fA-F]{6}$/.test(String(v))) ? String(v) : undefined;
  if (Array.isArray(r)) return r.includes(v) ? v : undefined;
  const n = Math.round(+v);
  return Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, n)) : undefined;
}
const T = (key, vars) => I18N.t(key, vars);
function syncLang() { I18N.setLang(I18N.resolve(settings.lang, app.getLocale())); }
const settingsPayload = () => ({ ...settings, calendarUrl: undefined, calendarOn: settings.calSystem === 'on' || !!settings.calendarUrl, icalOn: !!settings.calendarUrl, lang: I18N.lang, langPref: settings.lang,
  startAtLogin: startsAtLogin(), hooksInstalled: HOOKS.status(), agents: HOOKS.agents(), version: app.getVersion(), port: PORT, settingsPath: settingsFile() });
function writeLaunchTarget() {
  const target = { exe: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), 'launch.json'), JSON.stringify(target));
  } catch {}
}

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
  for (const k of ['radiusCompact', 'radiusOverlay', 'radiusPeek', 'radiusFull']) { if (typeof settings[k] !== 'number') settings[k] = settings.radius; }
  settings.rules = RULES.sanitize(settings.rules);
  syncLang();
  if (settings.media !== 'off') {
    media.setSource(settings.media);
    media.setActive(true);
  }
}
function setSetting(k, v) {
  settings[k] = v;
  if (k === 'radius') { for (const k2 of ['radiusCompact', 'radiusOverlay', 'radiusPeek', 'radiusFull']) settings[k2] = v; }
  syncLang();
  if (k === 'media') {
    if (v === 'off') media.setActive(false);
    else {
      media.setSource(v);
      media.setActive(true);
    }
  }
  if (k === 'display' && win) place();
  if (k === 'osd' || k === 'focusSync') system.setActive(v !== 'off' || settings.osd !== 'off' || settings.focusSync === 'on');
  if (k === 'calendarUrl' || k === 'calSystem') refreshCalendar();
  if (k === 'gameMode') syncVisibility();
  if (k === 'focusSync') { if (v === 'off' && winFocusOurs) WIN.focus(false); syncFocusWatch(); }
  if (k === 'accentColor') send('theme-changed', getThemeInfo());
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch {}
  if (win && !win.isDestroyed()) win.webContents.send('settings', settingsPayload());
  if (tray) tray.setContextMenu(trayMenu());
}

function summarize(tool, i) {
  i = i && typeof i === 'object' ? i : {};
  switch (tool) {
    case 'Bash': return i.command || '';
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': return i.file_path || '';
    case 'NotebookEdit': return i.notebook_path || '';
    case 'Grep': return (i.pattern || '') + (i.path ? '  in ' + i.path : '');
    case 'Glob': return i.pattern || '';
    case 'WebFetch': return i.url || '';
    case 'WebSearch': return i.query || '';
    case 'Task': case 'Agent': return i.description || i.prompt || '';
    case 'TodoWrite': return I18N.plural('main.tasks', (i.todos && i.todos.length) || 0);
    case 'AskUserQuestion': {
      const qs = questionsOf(i);
      return qs.length ? qs[0].question + (qs.length > 1 ? `  (+${qs.length - 1})` : '') : '';
    }
    default: { const s = JSON.stringify(i); return s === '{}' ? '' : s; }
  }
}

function questionsOf(i) {
  const qs = i && Array.isArray(i.questions) ? i.questions : [];
  return qs.slice(0, 4).filter((q) => q && typeof q.question === 'string').map((q) => ({
    question: q.question.slice(0, 600),
    header: typeof q.header === 'string' ? q.header.slice(0, 40) : '',
    multiSelect: !!q.multiSelect,
    options: (Array.isArray(q.options) ? q.options : []).slice(0, 8).filter((o) => o && typeof o.label === 'string')
      .map((o) => ({ label: o.label.slice(0, 120), description: typeof o.description === 'string' ? o.description.slice(0, 300) : '' })),
  }));
}

function detailOf(tool, i) {
  i = i && typeof i === 'object' ? i : {};
  const cut = (t, n) => (String(t || '').length > n ? String(t).slice(0, n) + '…' : String(t || ''));
  switch (tool) {
    case 'Bash': return cut(i.command, 900) + (i.description ? '\n# ' + i.description : '');
    case 'Write': return i.file_path + '\n\n' + cut(i.content, 700);
    case 'Edit': return i.file_path + '\n\n- ' + cut(i.old_string, 350).split('\n').join('\n- ') + '\n+ ' + cut(i.new_string, 350).split('\n').join('\n+ ');
    case 'MultiEdit': return i.file_path + '\n(' + I18N.plural('main.edits', (i.edits && i.edits.length) || 0) + ')';
    case 'AskUserQuestion': return questionsOf(i).map((q) => q.question + '\n' + q.options.map((o) => '  • ' + o.label).join('\n')).join('\n\n');
    default: return cut(summarize(tool, i), 900);
  }
}

function respToText(r) {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  if (typeof r === 'object') {
    const parts = [];
    if (typeof r.stdout === 'string' && r.stdout) parts.push(r.stdout);
    if (typeof r.stderr === 'string' && r.stderr) parts.push('[stderr]\n' + r.stderr);
    if (parts.length) return parts.join('\n');
    if (r.file && typeof r.file.content === 'string') return r.file.content;
    if (typeof r.content === 'string') return r.content;
    if (typeof r.output === 'string') return r.output;
    if (Array.isArray(r.filenames)) return r.filenames.join('\n');
    try { return JSON.stringify(r, null, 2); } catch { return ''; }
  }
  return String(r);
}

function getSession(e) {
  let s = sessions.get(e.session_id);
  if (!s) {
    s = { id: e.session_id, agent: AGENT_IDS.includes(e.agent) ? e.agent : 'claude', cwd: e.cwd || '', name: '', status: 'idle', prompt: '', since: e.ts, updated: e.ts, started: e.ts,
      activity: [], tools: 0, totalTools: 0, current: null, lastText: '', transcript: '', lastRead: 0,
      seq: 0, todos: [], files: {}, toolCounts: {}, turns: 0, errors: 0 };
    sessions.set(s.id, s);
  }
  if (e.cwd) s.cwd = e.cwd;
  if (e.ppid && (e.event === 'SessionStart' || !s.ppid)) { s.ppid = e.ppid; s.agentPid = 0; }
  if (e.transcript_path && s.agent === 'claude') s.transcript = e.transcript_path;
  s.name = path.basename(s.cwd) || s.cwd || 'oturum';
  s.updated = e.ts;
  return s;
}

function addActivity(s, a) {
  a.n = ++s.seq;
  s.activity.push(a);
  if (s.activity.length > MAX_ACTIVITY) s.activity.shift();
  return a;
}

function publicSession(s) {
  const { activity, files, ...rest } = s;
  return {
    ...rest,
    current: s.current && { n: s.current.n, tool: s.current.tool, summary: s.current.summary, ts: s.current.ts },
    activity: activity.map((a) => ({ n: a.n, tool: a.tool, summary: a.summary, ts: a.ts, endedAt: a.endedAt, done: a.done, error: a.error })),
    files: Object.entries(files).map(([p, f]) => ({ path: p, ...f })).sort((a, b) => b.last - a.last).slice(0, 30),
  };
}

async function readLastText(s) {
  if (!s.transcript) return false;
  s.lastRead = Date.now();
  try {
    const fh = await fs.promises.open(s.transcript, 'r');
    const { size } = await fh.stat();
    const len = Math.min(size, 262144);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    await fh.close();
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (!l || l[0] !== '{') continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.type !== 'assistant') continue;
      const c = o.message && o.message.content;
      if (!Array.isArray(c)) continue;
      const t = c.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n').trim();
      if (t) { s.lastText = t.slice(0, 3000); return true; }
    }
  } catch {}
  return false;
}

async function getTranscript(sid) {
  const s = sessions.get(sid);
  if (!s || !s.transcript) return { messages: [], usage: null, model: '' };
  try {
    const st = await fs.promises.stat(s.transcript);
    const key = st.mtimeMs + ':' + st.size;
    const c = transcriptCache.get(sid);
    if (c && c.key === key) return c.data;
    const fh = await fs.promises.open(s.transcript, 'r');
    const len = Math.min(st.size, 4 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, st.size - len);
    await fh.close();
    const messages = [];
    const usageById = new Map();
    let model = '';
    for (const line of buf.toString('utf8').split('\n')) {
      const l = line.trim();
      if (!l || l[0] !== '{') continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.isMeta) continue;
      const m = o.message; if (!m) continue;
      const ts = o.timestamp ? Date.parse(o.timestamp) : 0;
      if (o.type === 'user') {
        let text = '';
        if (typeof m.content === 'string') text = m.content;
        else if (Array.isArray(m.content)) text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        text = text.trim();
        if (!text) continue;
        messages.push({ role: 'user', text: text.slice(0, 6000), ts, tools: [] });
      } else if (o.type === 'assistant' && Array.isArray(m.content)) {
        if (m.model) model = m.model;
        if (m.usage && m.id) usageById.set(m.id, m.usage);
        const text = m.content.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n').trim();
        const tools = m.content.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, summary: summarize(b.name, b.input).slice(0, 160) }));
        if (!text && !tools.length) continue;
        const prev = messages[messages.length - 1];
        if (prev && prev.role === 'assistant') {
          if (text) prev.text = (prev.text ? prev.text + '\n\n' : '') + text.slice(0, 6000);
          prev.tools.push(...tools);
        } else messages.push({ role: 'assistant', text: text.slice(0, 6000), ts, tools });
      }
    }
    const usage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    for (const u of usageById.values()) {
      usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
      usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheCreate += u.cache_creation_input_tokens || 0;
    }
    const data = { messages: messages.slice(-60), usage, model };
    transcriptCache.set(sid, { key, data });
    return data;
  } catch { return { messages: [], usage: null, model: '' }; }
}

function dropPending(sessionId, answerEmpty) {
  for (const [id, p] of pending) {
    if (p.session_id !== sessionId) continue;
    if (answerEmpty && !p.res.writableEnded) { p.res.writeHead(200); p.res.end('{}'); }
    pending.delete(id);
  }
}

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
function trackTool(s, tool, inp, ts) {
  s.status = 'working'; s.tools++; s.totalTools++;
  s.toolCounts[tool] = (s.toolCounts[tool] || 0) + 1;
  const fp = inp.file_path || inp.notebook_path;
  if (fp) {
    const f = (s.files[fp] = s.files[fp] || { reads: 0, writes: 0, last: 0 });
    if (tool === 'Read') f.reads++; else if (WRITE_TOOLS.includes(tool)) f.writes++;
    f.last = ts;
  }
  if (s.turn) {
    s.turn.tools++;
    if (fp && WRITE_TOOLS.includes(tool) && !s.turn.files.includes(fp) && s.turn.files.length < 200) s.turn.files.push(fp);
  }
}

function finishTurn(s, ts) {
  const t = s.turn;
  if (!t) return;
  s.turn = null;
  const rec = { id: s.id + ':' + t.start, sid: s.id, name: s.name, agent: s.agent, cwd: s.cwd, prompt: t.prompt,
    start: t.start, end: ts, tools: t.tools, files: t.files, errors: t.errors, text: '' };
  s.lastSummary = rec;
  const save = () => { rec.text = (s.lastText || '').slice(0, 600); HISTORY.add(rec); };
  if (s.agent === 'claude' && s.transcript) readLastText(s).then(() => { save(); push(null); }); else save();
}

function handle(e) {
  if (!e.session_id) return null;
  if (e.event === 'SessionEnd') { dropPending(e.session_id, true); sessions.delete(e.session_id); return null; }
  const s = getSession(e);
  switch (e.event) {
    case 'SessionStart': s.status = 'idle'; s.since = e.ts; return null;
    case 'UserPromptSubmit':
      dropPending(s.id, true);
      s.status = 'working'; s.since = e.ts; s.tools = 0; s.current = null; s.turns++;
      s.prompt = (e.prompt || '').replace(/\s+/g, ' ').slice(0, 300);
      s.turn = { start: e.ts, prompt: s.prompt, tools: 0, files: [], errors: 0 };
      addActivity(s, { tool: 'Prompt', summary: s.prompt, ts: e.ts, done: true, input: { prompt: e.prompt || '' } });
      return null;
    case 'PreToolUse': {
      const inp = e.tool_input || {};
      trackTool(s, e.tool_name, inp, e.ts);
      if (e.tool_name === 'TodoWrite' && Array.isArray(inp.todos)) s.todos = inp.todos.map((t) => ({ content: t.content, status: t.status, activeForm: t.activeForm }));
      const a = addActivity(s, { id: e.tool_use_id, tool: e.tool_name, summary: summarize(e.tool_name, inp).slice(0, 240), ts: e.ts, done: false, input: inp });
      s.current = a;
      if (Date.now() - s.lastRead > 2000) readLastText(s).then(() => push(null));
      return null;
    }
    case 'PostToolUse': {
      dropPending(s.id, true);
      const a = [...s.activity].reverse().find((x) => !x.done && (e.tool_use_id ? x.id === e.tool_use_id : x.tool === e.tool_name));
      if (a) {
        a.done = true; a.endedAt = e.ts;
        a.output = respToText(e.tool_response).slice(0, 12000);
        const r = e.tool_response;
        if (r && typeof r === 'object' && (r.interrupted || r.is_error)) { a.error = true; s.errors++; if (s.turn) s.turn.errors++; }
      }
      if (s.current && a && s.current === a) s.current = null;
      s.status = 'working';
      return null;
    }
    case 'ToolDone': {
      const inp = e.tool_input || {};
      trackTool(s, e.tool_name, inp, e.ts);
      const a = addActivity(s, { id: e.tool_use_id, tool: e.tool_name, summary: summarize(e.tool_name, inp).slice(0, 240), ts: e.ts, done: true, endedAt: e.ts, input: inp });
      a.output = respToText(e.tool_response).slice(0, 12000);
      s.current = a; s.currentUntil = e.ts + 4000;
      return null;
    }
    case 'AssistantText':
      if (e.last_message) s.lastText = String(e.last_message).slice(0, 3000);
      return null;
    case 'Notification':
      if (e.notification_type === 'idle_prompt') return null;
      s.status = 'waiting'; s.message = e.message || T('main.waitingInput');
      return 'waiting';
    case 'Stop':
      dropPending(s.id, true);
      s.status = 'done'; s.doneAt = e.ts; s.current = null;
      if (e.error) { s.errors++; if (s.turn) s.turn.errors++; }
      if (e.last_message) s.lastText = String(e.last_message).slice(0, 3000);
      finishTurn(s, e.ts);
      return 'done';
  }
  return null;
}

function publicPending() {
  return [...pending.values()].map(({ res, suggestions, input, ...p }) => ({ ...p, hasSug: !!(suggestions && suggestions.length),
    ruleHint: p.questions ? null : RULES.suggest(p.tool, input) }));
}

function setRules(list) {
  settings.rules = RULES.sanitize(list);
  setSetting('rules', settings.rules);
  for (const p of [...pending.values()]) applyRule(p);
}
function applyRule(p) {
  if (p.questions) return false;
  const s = sessions.get(p.session_id);
  const rule = RULES.find(settings.rules, p.tool, p.input, s ? s.cwd : '');
  if (!rule) return false;
  if (rule.action === 'deny') {
    decide(p.id, 'deny', null, T('main.ruleDenied', { rule: (rule.pattern || rule.tool) }));
    send('notice', { kind: 'error', text: T('main.ruleDeniedNotice', { tool: p.tool, summary: p.summary.slice(0, 60) }) }); hold('notice', 4000);
  } else decide(p.id, 'allow');
  return true;
}
function ruleFromPending(id) {
  const p = pending.get(id);
  if (!p || p.questions) return;
  const s = sessions.get(p.session_id);
  const rule = { id: Date.now().toString(36), action: 'allow', tool: p.tool, pattern: RULES.suggest(p.tool, p.input), cwd: s ? s.cwd : '' };
  setRules([...(settings.rules || []), rule]);
  if (pending.has(id)) decide(id, 'allow');
}

function syncShortcuts() {
  const want = [...pending.values()].some((p) => !p.questions);
  if (want === shortcutsOn) return;
  shortcutsOn = want;
  if (want) {
    const first = () => { const p = [...pending.values()].find((x) => !x.questions); return p && p.id; };
    globalShortcut.register('Control+Alt+Y', () => decide(first(), 'allow'));
    globalShortcut.register('Control+Alt+N', () => decide(first(), 'deny'));
    globalShortcut.register('Control+Alt+Left', () => send('perm-nav', 'prev'));
    globalShortcut.register('Control+Alt+Right', () => send('perm-nav', 'next'));
  } else {
    globalShortcut.unregister('Control+Alt+Y');
    globalShortcut.unregister('Control+Alt+N');
    globalShortcut.unregister('Control+Alt+Left');
    globalShortcut.unregister('Control+Alt+Right');
  }
}

let timer = null, timerT = null;
const clampMin = (v, lo, hi, def) => Math.min(hi, Math.max(lo, Math.round(+v) || def));
let winFocusOurs = false, winFocusQuietUntil = 0;
function pushWinFocus(t) {
  if (settings.focusSync !== 'on') return;
  const want = !!(t && t.phase === 'focus' && !t.paused);
  if (!want && !winFocusOurs) return;
  winFocusOurs = want;
  winFocusQuietUntil = Date.now() + 6000;
  WIN.focus(want, want ? (t.endsAt - Date.now()) / 60000 : 0);
}
function onWinFocus(active) {
  if (settings.focusSync !== 'on' || Date.now() < winFocusQuietUntil) return;
  if (active && !(timer && timer.phase === 'focus')) {
    winFocusOurs = true;
    setTimer({ phase: 'focus', dur: settings.focusMin * 60000, endsAt: Date.now() + settings.focusMin * 60000, paused: false, left: 0, cycles: timer ? timer.cycles : 0, windows: true }, true);
    hold('timer', 5000);
  } else if (!active && winFocusOurs && timer && timer.phase === 'focus' && !timer.paused && timer.endsAt - Date.now() > 15000) {
    winFocusOurs = false;
    setTimer(null, true);
  }
}
function syncFocusWatch() { if (settings.focusSync === 'on' && timer) system.setActive(true); }

function setTimer(t, fromWindows) {
  if (!fromWindows) pushWinFocus(t);
  timer = t;
  syncFocusWatch();
  clearTimeout(timerT);
  if (timer && !timer.paused) timerT = setTimeout(timerDone, Math.max(0, timer.endsAt - Date.now()));
  send('timer', timer);
  syncVisibility();
  if (tray) tray.setContextMenu(trayMenu());
}
function startTimer(phase, min, cycles) {
  setTimer({ phase, dur: min * 60000, endsAt: Date.now() + min * 60000, paused: false, left: 0, cycles });
}
function timerDone() {
  const t = timer;
  if (!t) return;
  hold('timer', 7000);
  const c = t.phase === 'focus' ? t.cycles + 1 : t.cycles;
  const next = t.phase === 'focus' && settings.autoBreak ? (c % 4 === 0 ? settings.longBreakMin : settings.breakMin) : 0;
  send('timer-done', { phase: t.phase, cycles: c, next });
  if (next) startTimer('break', next, c); else setTimer(null);
}
function timerCmd(cmd, arg) {
  const cycles = timer ? timer.cycles : 0;
  if (cmd === 'focus') startTimer('focus', clampMin(arg, 1, 180, settings.focusMin), cycles);
  else if (cmd === 'break') startTimer('break', clampMin(arg, 1, 60, settings.breakMin), cycles);
  else if (!timer) return;
  else if (cmd === 'pause' && !timer.paused) setTimer({ ...timer, paused: true, left: Math.max(0, timer.endsAt - Date.now()) });
  else if (cmd === 'resume' && timer.paused) setTimer({ ...timer, paused: false, endsAt: Date.now() + timer.left });
  else if (cmd === 'add') setTimer(timer.paused ? { ...timer, left: timer.left + 300000, dur: timer.dur + 300000 } : { ...timer, endsAt: timer.endsAt + 300000, dur: timer.dur + 300000 });
  else if (cmd === 'stop') setTimer(null);
}

const DAY = 86400000;
let cal = { events: [], error: '', at: 0 };
const calAlerted = new Set();
let calLoading = false;
let icalText = '';
async function fetchIcal(url) {
  const res = await net.fetch(url.replace(/^webcal:/i, 'https:'), { headers: { 'User-Agent': 'CC-Island' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error(T('cal.notIcs'));
  icalText = text;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  return CAL.eventsBetween(text, d0.getTime(), d0.getTime() + 2 * DAY).slice(0, 100);
}
const dedupe = (events) => {
  const seen = new Set();
  return events.filter((e) => { const k = (e.title || '').trim().toLowerCase() + '|' + e.start; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
};
const rangeCache = new Map();
async function calendarRange(from, days) {
  from = Math.round(+from) || 0; days = Math.min(62, Math.max(1, Math.round(+days) || 42));
  const key = from + ':' + days + ':' + settings.calSystem + ':' + !!settings.calendarUrl;
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.data;
  const events = [];
  if (settings.calSystem === 'on') { const r = await WIN.events(days, from); if (r && r.ok) events.push(...(r.events || [])); }
  if (settings.calendarUrl && icalText) { try { events.push(...CAL.eventsBetween(icalText, from, from + days * DAY)); } catch {} }
  const data = { events: dedupe(events).slice(0, 600) };
  rangeCache.set(key, { at: Date.now(), data });
  if (rangeCache.size > 12) rangeCache.delete(rangeCache.keys().next().value);
  return data;
}
async function refreshCalendar() {
  const url = settings.calendarUrl, sys = settings.calSystem === 'on';
  if (!url && !sys) { cal = { events: [], error: '', at: 0, sources: {} }; send('calendar', cal); syncVisibility(); return; }
  if (calLoading) return;
  calLoading = true;
  const errors = [], events = [], sources = {};
  await Promise.all([
    sys && WIN.events(2).then((r) => {
      if (r && r.ok) { events.push(...(r.events || [])); sources.windows = { calendars: r.calendars || [], n: (r.events || []).length }; }
      else errors.push('Windows: ' + ((r && r.error) || '?'));
    }),
    url && fetchIcal(url).then((ev) => { events.push(...ev); sources.ical = { n: ev.length }; }, (e) => errors.push('iCal: ' + String((e && e.message) || e))),
  ]);
  const merged = dedupe(events).slice(0, 150);
  rangeCache.clear();
  cal = { events: merged, error: errors.length && !events.length ? errors.join(' · ') : '', warn: errors.join(' · '), at: Date.now(), sources };
  calLoading = false;
  send('calendar', cal);
  send('settings', settingsPayload());
  checkCalendar();
  if (tray) tray.setContextMenu(trayMenu());
}
const calSoon = () => { const now = Date.now(); return cal.events.some((e) => !e.allDay && e.start - now <= 15 * 60000 && now - e.start < 5 * 60000); };
function checkCalendar() {
  if (!pageReady) return syncVisibility();
  const now = Date.now();
  for (const e of cal.events) {
    if (e.allDay) continue;
    const dt = e.start - now;
    const alert = (kind) => { if (calAlerted.has(e.id + kind)) return; calAlerted.add(e.id + kind); send('cal-alert', { kind, event: e }); hold('cal', 9000); };
    if (dt > 60000 && dt <= 10 * 60000) alert('soon');
    else if (dt <= 0 && dt > -2 * 60000) alert('now');
  }
  syncVisibility();
}
function useClipboardCalendar() {
  const url = clipboard.readText().trim();
  if (!/^(https?|webcal):\/\/\S+$/i.test(url)) { send('notice', { kind: 'error', text: T('cal.badClipboard') }); hold('notice', 6000); return; }
  setSetting('calendarUrl', url);
  send('notice', { kind: 'success', text: T('cal.connected') }); hold('notice', 5000);
}

let hideTimer = null, emptySince = Date.now();
const holds = new Map();
function hold(name, ms) {
  holds.set(name, Date.now() + ms);
  syncVisibility();
  setTimeout(syncVisibility, ms + 50);
}
function held() {
  const now = Date.now();
  for (const [k, t] of holds) if (t <= now) holds.delete(k);
  return holds.size > 0;
}
const busyVisible = () => sessions.size > 0 || pending.size > 0 || !!timer || calSoon();
const wantVisible = () => busyVisible() || held();
let game = { active: false, d3d: false, mon: null }, gameSent = null;
function onGame(g) {
  game = g;
  syncVisibility();
}
function gameOnOurDisplay() {
  if (!game.mon || !win || win.isDestroyed()) return true;
  try {
    const [x, y, w, h] = game.mon;
    const c = screen.screenToDipPoint({ x: x + w / 2, y: y + h / 2 });
    return screen.getDisplayNearestPoint(c).id === screen.getDisplayMatching(win.getBounds()).id;
  } catch { return true; }
}
function gameBlocks() {
  if (settings.gameMode === 'off' || !game.active || !gameOnOurDisplay()) return false;
  if (game.d3d) return true;
  return !(settings.gameMode === 'important' && pending.size > 0);
}
function syncGame(blocked) {
  const v = game.active && settings.gameMode !== 'off' && gameOnOurDisplay();
  if (v !== gameSent) { gameSent = v; send('game', v); }
  return blocked;
}

function syncVisibility() {
  if (!win || win.isDestroyed()) return;
  if (wantVisible()) {
    clearTimeout(hideTimer); hideTimer = null; emptySince = 0;
    if (settings.osd !== 'off' || settings.focusSync === 'on' || settings.gameMode !== 'off') system.setActive(true);
    if (syncGame(gameBlocks())) { if (win.isVisible()) win.hide(); media.setActive(false); return; }
    if (settings.media !== 'off') media.setActive(true);
    if (!win.isVisible()) { place(); win.showInactive(); }
  } else {
    if (!emptySince) emptySince = Date.now();
    if (win.isVisible() && !hideTimer) hideTimer = setTimeout(() => { hideTimer = null; if (!wantVisible() && win && !win.isDestroyed()) { win.hide(); media.setActive(false); system.setActive(false); } }, 2500);
  }
}

function agentsAlive() {
  const ps = "$p = @(Get-CimInstance Win32_Process -Property Name,CommandLine); $o = @();" +
    "if ($p | Where-Object { ($_.Name -eq 'claude.exe' -and $_.CommandLine -notmatch 'AnthropicClaude|WindowsApps|--type=') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'claude-code') }) { $o += 'claude' };" +
    "if ($p | Where-Object { $_.Name -eq 'codex.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'openai.codex') }) { $o += 'codex' };" +
    "if ($p | Where-Object { $_.Name -eq 'gemini.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'gemini-cli|bin.gemini') }) { $o += 'gemini' };" +
    "if ($p | Where-Object { $_.Name -eq 'Cursor.exe' }) { $o += 'cursor' };" +
    "'ok:' + ($o -join ',')";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const m = /ok:(.*)/.exec(String(out));
      resolve(err || !m ? null : new Set(m[1].trim().split(',').filter(Boolean)));
    });
  });
}

function push(notify) {
  if (notify && settings.display === 'cursor' && win && !win.isDestroyed()) place();
  if (pending.size) setSurface('overlay');
  syncShortcuts();
  syncVisibility();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state', { sessions: [...sessions.values()].map(publicSession), pending: publicPending(), notify });
}

function decide(id, behavior, answers, denyMessage) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  const s = sessions.get(p.session_id);
  let body = '{}';
  if (behavior === 'answer' && p.questions && answers && typeof answers === 'object') {
    const clean = {};
    for (const q of p.questions) if (typeof answers[q.question] === 'string') clean[q.question] = answers[q.question].slice(0, 1000);
    body = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', updatedInput: { ...p.input, answers: clean } } } });
    if (s) s.status = 'working';
  } else if (behavior === 'allow' || behavior === 'always') {
    const decision = { behavior: 'allow' };
    if (behavior === 'always' && p.suggestions) decision.updatedPermissions = p.suggestions;
    body = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });
    if (s) s.status = 'working';
  } else if (behavior === 'deny') {
    body = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: denyMessage || T('main.denied') } } });
    if (s) s.status = 'working';
  }
  if (!p.res.writableEnded) { p.res.writeHead(200, { 'Content-Type': 'application/json' }); p.res.end(body); }
  push(null);
}

const SHELLS = /^(cmd|bash|sh|dash|zsh|fish|pwsh|powershell|conhost|openconsole|wsl|wslhost|mintty|git-bash)\.exe$/i;
async function agentPid(s) {
  if (s.agentPid) return s.agentPid;
  if (!s.ppid) return 0;
  const chain = await HELPER.runOnce(['ancestors', '--pid', String(s.ppid)]);
  const hit = Array.isArray(chain) && chain.find((p) => p && p.name && !SHELLS.test(p.name));
  s.agentPid = hit ? hit.pid : 0;
  return s.agentPid;
}
async function replyToSession(sid, text) {
  const s = sessions.get(sid);
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!s || !text) return { ok: false, error: 'empty' };
  if (s.agent === 'cursor') return { ok: false, error: 'unsupported' };
  if (!HELPER.hasNative()) return { ok: false, error: 'native' };
  if ([...pending.values()].some((p) => p.session_id === sid)) return { ok: false, error: 'pending' };
  const pid = await agentPid(s);
  if (!pid) return { ok: false, error: 'nopid' };
  let r = await HELPER.runOnce(['type', '--pid', String(pid), '--text', text]);
  if (!(r && r.ok)) { s.agentPid = 0; const pid2 = await agentPid(s); if (pid2 && pid2 !== pid) r = await HELPER.runOnce(['type', '--pid', String(pid2), '--text', text]); }
  return r && r.ok ? { ok: true } : { ok: false, error: (r && r.error) || 'type' };
}

function startServer() {
  http.createServer((req, res) => {
    if (req.method !== 'POST' || (req.url !== '/event' && req.url !== '/permission')) { res.writeHead(404); return res.end(); }
    if (req.headers.origin || !String(req.headers['content-type'] || '').startsWith('application/json')) { res.writeHead(403); return res.end(); }
    let body = '', size = 0, tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > MAX_BODY) { tooBig = true; res.writeHead(413); res.end(); req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      if (tooBig) return;
      let e;
      try { e = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      if (req.url === '/event') {
        const t = handle(e);
        res.writeHead(204); res.end();
        push(t ? { type: t, id: e.session_id } : null);
        return;
      }
      if (!e.session_id) { res.writeHead(200); return res.end('{}'); }
      const s = getSession(e);
      const p = { id: nextId++, session_id: s.id, tool: e.tool_name || '?', summary: summarize(e.tool_name, e.tool_input).slice(0, 240),
        detail: detailOf(e.tool_name, e.tool_input), ts: e.ts || Date.now(), suggestions: e.permission_suggestions || null, res,
        input: e.tool_input || {}, questions: e.tool_name === 'AskUserQuestion' ? questionsOf(e.tool_input) : null };
      if (p.questions && !p.questions.length) p.questions = null;
      pending.set(p.id, p);
      if (applyRule(p)) return;
      s.status = 'waiting'; s.message = p.questions ? T('main.waitingQuestion') : T('main.waitingPermission', { tool: p.tool });
      res.on('close', () => { if (!res.writableEnded && pending.delete(p.id)) push(null); });
      push({ type: p.questions ? 'question' : 'permission', id: s.id });
    });
  }).listen(PORT, '127.0.0.1');
}

const W0 = 940, H0 = 800;
const SMALL = [520, 780];
const SURFACE = { compact: SMALL, peek: SMALL, overlay: SMALL, expanding: [W0, H0], full: [W0, H0] };
let surfaceSize = SURFACE.compact;
function setSurface(v) {
  const s = SURFACE[v];
  if (!s || win && win.isDestroyed() || s === surfaceSize) return;
  surfaceSize = s;
  place();
}
function place() {
  const d = settings.display === 'cursor' ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getPrimaryDisplay();
  const W = Math.min(surfaceSize[0], d.bounds.width), H = Math.min(surfaceSize[1], d.bounds.height);
  const b = { x: Math.round(d.bounds.x + (d.bounds.width - W) / 2), y: d.bounds.y, width: W, height: H };
  const c = win.getBounds();
  if (c.x !== b.x || c.y !== b.y || c.width !== b.width || c.height !== b.height) win.setBounds(b);
}

const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] });
const startsAtLogin = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
function setStartAtLogin(on) {
  app.setLoginItemSettings({ ...loginOpts(), openAtLogin: on });
  send('settings', settingsPayload());
  if (tray) tray.setContextMenu(trayMenu());
}

function createWindow() {
  win = new BrowserWindow({
    width: W0, height: H0, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  place();
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    pageReady = true;
    hold('startup', 15000);
    send('open-full');
    push(null);
    if (latestMedia) send('media', latestMedia);
    send('settings', settingsPayload());
    send('timer', timer);
    send('calendar', cal);
    checkCalendar();
  });
  screen.on('display-metrics-changed', place);
}

function trayMenu() {
  const radio = (label, checked, click) => ({ label, type: 'radio', checked, click });
  return Menu.buildFromTemplate([
    { label: 'Adayı Aç / Genişlet (Open Island)', click: () => { hold('manual', 60000); send('open-full'); } },
    { label: T('set.title') + '…', click: () => { hold('settings', 20000); send('open-settings'); } },
    { type: 'separator' },
    { label: T('tray.language'), submenu: [
      radio(T('tray.langAuto'), settings.lang === 'auto', () => setSetting('lang', 'auto')),
      radio('English', settings.lang === 'en', () => setSetting('lang', 'en')),
      radio('Türkçe', settings.lang === 'tr', () => setSetting('lang', 'tr')),
    ] },
    { label: T('tray.animations'), submenu: [
      radio(T('tray.animOn'), settings.motion === 'on', () => setSetting('motion', 'on')),
      radio(T('tray.animSystem'), settings.motion === 'system', () => setSetting('motion', 'system')),
      radio(T('tray.animOff'), settings.motion === 'off', () => setSetting('motion', 'off')),
    ] },
    { label: T('tray.sound'), submenu: [
      radio(T('tray.soundOn'), settings.sound === 'on', () => setSetting('sound', 'on')),
      radio(T('tray.soundImportant'), settings.sound === 'important', () => setSetting('sound', 'important')),
      radio(T('tray.soundOff'), settings.sound === 'off', () => setSetting('sound', 'off')),
    ] },
    { label: T('tray.media'), submenu: [
      radio(T('tray.mediaSpotify'), settings.media === 'spotify', () => setSetting('media', 'spotify')),
      radio(T('tray.mediaAll'), settings.media === 'all', () => setSetting('media', 'all')),
      radio(T('tray.mediaOff'), settings.media === 'off', () => setSetting('media', 'off')),
    ] },
    { label: T('tray.game'), submenu: [
      radio(T('tray.gameHide'), settings.gameMode === 'hide', () => setSetting('gameMode', 'hide')),
      radio(T('tray.gameImportant'), settings.gameMode === 'important', () => setSetting('gameMode', 'important')),
      radio(T('tray.gameOff'), settings.gameMode === 'off', () => setSetting('gameMode', 'off')),
    ] },
    { label: T('tray.display'), submenu: [
      radio(T('tray.displayPrimary'), settings.display === 'primary', () => setSetting('display', 'primary')),
      radio(T('tray.displayCursor'), settings.display === 'cursor', () => setSetting('display', 'cursor')),
    ] },
    { label: T('tray.shape'), submenu: [
      radio(T('tray.shapeNotch'), settings.shape !== 'pill', () => setSetting('shape', 'notch')),
      radio(T('tray.shapePill'), settings.shape === 'pill', () => setSetting('shape', 'pill')),
    ] },
    { label: T('tray.radius'), submenu: [
      radio(T('tray.radiusSharp'), settings.radius === 0, () => setSetting('radius', 0)),
      radio(T('tray.radiusNormal'), settings.radius === 100, () => setSetting('radius', 100)),
      radio(T('tray.radiusRound'), settings.radius === 150, () => setSetting('radius', 150)),
    ] },
    { label: T('tray.osd'), type: 'checkbox', checked: settings.osd !== 'off', click: (item) => setSetting('osd', item.checked ? 'on' : 'off') },
    { label: T('tray.startup'), type: 'checkbox', checked: startsAtLogin(), click: (item) => setStartAtLogin(item.checked) },
    { type: 'separator' },
    { label: T('tray.timer'), submenu: [
      { label: T('tray.focus', { m: settings.focusMin }), click: () => timerCmd('focus', settings.focusMin) },
      { label: T('tray.focus', { m: 50 }), visible: settings.focusMin !== 50, click: () => timerCmd('focus', 50) },
      { label: T('tray.break', { m: settings.breakMin }), click: () => timerCmd('break', settings.breakMin) },
      { type: 'separator' },
      { label: timer && timer.paused ? T('tray.resume') : T('tray.pause'), enabled: !!timer, click: () => timerCmd(timer && timer.paused ? 'resume' : 'pause') },
      { label: T('tray.stop'), enabled: !!timer, click: () => timerCmd('stop') },
    ] },
    { label: T('tray.calendar'), submenu: [
      { label: !(settings.calendarUrl || settings.calSystem === 'on') ? T('cal.notConnected') : cal.error ? T('cal.error', { e: cal.error.slice(0, 60) })
        : T('cal.status', { t: cal.at ? new Date(cal.at).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' }) : '…', n: cal.events.length }), enabled: false },
      { label: T('cal.useClipboard'), click: useClipboardCalendar },
      { label: T('cal.refresh'), enabled: !!settings.calendarUrl || settings.calSystem === 'on', click: () => refreshCalendar() },
      { label: T('cal.disconnect'), enabled: !!settings.calendarUrl, click: () => setSetting('calendarUrl', '') },
    ] },
    { type: 'separator' },
    { label: T('tray.demo'), click: () => win && win.webContents.send('demo') },
    { label: T('tray.clear'), click: () => { for (const id of sessions.keys()) dropPending(id, true); sessions.clear(); push(null); } },
    { type: 'separator' },
    { label: T('tray.quit'), click: () => app.quit() },
  ]);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

function rampFromHex(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const tint = (f) => [r, g, b].map((c) => Math.round(c + (255 - c) * f));
  const shade = (f) => [r, g, b].map((c) => Math.round(c * (1 - f)));
  return {
    light3: rgbToHsl(...tint(0.6)), light2: rgbToHsl(...tint(0.4)), light1: rgbToHsl(...tint(0.2)),
    base: rgbToHsl(r, g, b),
    dark1: rgbToHsl(...shade(0.25)), dark2: rgbToHsl(...shade(0.5)), dark3: rgbToHsl(...shade(0.75)),
  };
}

function getAccentPalette() {
  if (settings.accentColor) return rampFromHex(settings.accentColor);

  try {
    const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent" /v AccentPalette', { encoding: 'utf8', windowsHide: true });
    const match = out.match(/AccentPalette\s+REG_BINARY\s+([0-9A-Fa-f]+)/);
    if (match && match[1] && match[1].length >= 56) {
      const hex = match[1];
      const colors = [];
      for (let i = 0; i < 7; i++) {
        const offset = i * 8;
        const r = parseInt(hex.slice(offset, offset + 2), 16);
        const g = parseInt(hex.slice(offset + 2, offset + 4), 16);
        const b = parseInt(hex.slice(offset + 4, offset + 6), 16);
        colors.push(rgbToHsl(r, g, b));
      }
      return {
        light3: colors[0],
        light2: colors[1],
        light1: colors[2],
        base: colors[3],
        dark1: colors[4],
        dark2: colors[5],
        dark3: colors[6],
      };
    }
  } catch (e) {}

  try {
    if (systemPreferences && typeof systemPreferences.getAccentColor === 'function') {
      const hex = systemPreferences.getAccentColor();
      if (hex && hex.length >= 6) return rampFromHex('#' + hex.slice(0, 6));
    }
  } catch (e) {}
  return null;
}

function getThemeInfo() {
  return {
    isDark: nativeTheme ? nativeTheme.shouldUseDarkColors : true,
    accent: getAccentPalette(),
  };
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) return app.quit();
  loadSettings();
  writeLaunchTarget();
  startServer();
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.setToolTip('CC Island');
  tray.setContextMenu(trayMenu());
  tray.on('right-click', () => tray.setContextMenu(trayMenu()));
  tray.on('click', () => {
    hold('tray', 60000);
    send('toggle-full');
  });

  app.on('second-instance', () => {
    hold('second-instance', 60000);
    send('open-full');
  });

  if (nativeTheme) {
    nativeTheme.on('updated', () => send('theme-changed', getThemeInfo()));
  }
  try {
    if (systemPreferences) {
      systemPreferences.on('accent-color-changed', () => send('theme-changed', getThemeInfo()));
    }
  } catch (e) {}

  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.updated > STALE_MS) sessions.delete(id);
  }, 60000);
  setInterval(async () => {
    if (sessions.size) {
      const alive = await agentsAlive();
      let changed = false;
      if (alive) for (const [id, s] of sessions) if (!alive.has(s.agent)) { dropPending(id, true); sessions.delete(id); changed = true; }
      if (changed) push(null);
    }
    if (AUTO && !wantVisible() && emptySince && Date.now() - emptySince > QUIT_MS) app.quit();
  }, +process.env.CC_CHECK_MS || 45000);
  system.setActive(settings.osd !== 'off' || settings.focusSync === 'on' || settings.gameMode !== 'off');
  refreshCalendar();
  setInterval(refreshCalendar, 5 * 60000);
  setInterval(checkCalendar, 15000);
});

ipcMain.handle('get-theme-info', () => getThemeInfo());

ipcMain.on('surface', (_e, v) => setSurface(String(v)));
ipcMain.on('mouse-over', (_e, over) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('decide', (_e, id, behavior, answers) => { if (behavior === 'rule') ruleFromPending(id); else decide(id, behavior, answers); });
ipcMain.on('rules-set', (_e, list) => setRules(list));
ipcMain.on('dismiss', (_e, id) => { dropPending(id, true); sessions.delete(id); push(null); });
ipcMain.on('media-cmd', (_e, cmd) => { if (/^(toggle|play|pause|next|prev|seek:\d+)$/.test(String(cmd))) media.send(cmd); });
ipcMain.on('copy', (_e, text) => clipboard.writeText(String(text || '')));
ipcMain.handle('get-detail', (_e, sid, n) => {
  const s = sessions.get(sid); const a = s && s.activity.find((x) => x.n === n);
  return a ? { input: a.input || null, output: a.output || '' } : null;
});
ipcMain.handle('get-transcript', (_e, sid) => getTranscript(sid));
ipcMain.handle('get-usage', () => usage.get());
ipcMain.on('set-setting', (_e, k, v) => { const ok = validSetting(String(k), v); if (ok !== undefined) setSetting(k, ok); });
ipcMain.on('set-login', (_e, on) => setStartAtLogin(!!on));
ipcMain.on('hooks-cmd', (_e, cmd, agent) => {
  if (cmd !== 'install' && cmd !== 'remove') return;
  agent = agent || 'claude';
  if (!HOOKS.agents().some((a) => a.id === agent)) return;
  try { HOOKS.installAgent(agent, cmd === 'remove'); send('notice', { kind: 'success', text: T(cmd === 'install' ? 'set.hooksDone' : 'set.hooksRemoved') }); }
  catch (e) { send('notice', { kind: 'error', text: String(e.message || e).split('\n')[0] }); }
  send('settings', settingsPayload());
});
ipcMain.on('app-cmd', (_e, cmd) => {
  if (cmd === 'demo') send('demo');
  else if (cmd === 'clear') { for (const id of sessions.keys()) dropPending(id, true); sessions.clear(); push(null); }
  else if (cmd === 'quit') app.quit();
  else if (cmd === 'win-accounts') shell.openExternal('ms-settings:emailandaccounts');
  else if (cmd === 'win-calendar') shell.openExternal('outlookcal:');
});
ipcMain.handle('get-history', () => HISTORY.list());
ipcMain.on('history-cmd', (_e, cmd, id) => { if (cmd === 'clear') HISTORY.clear(); else if (cmd === 'remove') HISTORY.remove(String(id)); });
ipcMain.handle('session-reply', (_e, sid, text) => replyToSession(String(sid), text));
ipcMain.handle('cal-range', (_e, from, days) => calendarRange(from, days));
ipcMain.on('timer-cmd', (_e, cmd, arg) => { if (/^(focus|break|pause|resume|add|stop)$/.test(String(cmd))) timerCmd(cmd, arg); });
ipcMain.on('cal-cmd', (_e, cmd) => {
  if (cmd === 'paste') useClipboardCalendar();
  else if (cmd === 'refresh') refreshCalendar();
  else if (cmd === 'disconnect') setSetting('calendarUrl', '');
});
ipcMain.on('open-external', (_e, url) => { if (typeof url === 'string' && /^(https?:\/\/|mailto:)/i.test(url) && url.length < 4096) shell.openExternal(url); });
ipcMain.on('open-link', (_e, url) => { if (cal.events.some((e) => e.link && e.link === url)) shell.openExternal(url); });
ipcMain.on('hold', (_e, ms) => hold('renderer', Math.min(10000, Math.max(0, +ms || 0))));
app.on('will-quit', () => { globalShortcut.unregisterAll(); media.setActive(false); system.dispose(); usage.stop(); });
app.on('window-all-closed', () => app.quit());
