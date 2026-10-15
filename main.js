const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, clipboard } = require('electron');
const http = require('http');
const { execFile } = require('child_process');
const { MediaWatcher } = require('./media');
const fs = require('fs');
const path = require('path');
const I18N = require('./i18n');

const PORT = +process.env.CC_PORT || 47321;
const AUTO = process.argv.includes('--auto'); // hook tarafından başlatıldı: Claude Code kapanınca kendini kapatır
const QUIT_MS = +process.env.CC_QUIT_MS || 60000;
const STALE_MS = 6 * 60 * 60 * 1000;
const MAX_ACTIVITY = 60;
const sessions = new Map();
const pending = new Map(); // izin id -> { id, session_id, tool, summary, detail, ts, suggestions, res }
const transcriptCache = new Map();
let win, tray, nextId = 1, shortcutsOn = false;
let latestMedia = null;
const media = new MediaWatcher((state) => {
  latestMedia = state;
  if (win && !win.isDestroyed()) win.webContents.send('media', state);
});

// ---------- ayarlar (userData/settings.json) ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { motion: 'on', lang: 'auto' }; // lang: 'auto' | 'en' | 'tr'
const T = (key, vars) => I18N.t(key, vars);
function syncLang() { I18N.setLang(I18N.resolve(settings.lang, app.getLocale())); }
const settingsPayload = () => ({ ...settings, lang: I18N.lang });
// hook.js reads this to relaunch the app the same way it was started (dev or packaged build)
function writeLaunchTarget() {
  const target = { exe: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), 'launch.json'), JSON.stringify(target));
  } catch {}
}

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
  syncLang();
}
function setSetting(k, v) {
  settings[k] = v;
  syncLang();
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch {}
  if (win && !win.isDestroyed()) win.webContents.send('settings', settingsPayload());
  if (tray) tray.setContextMenu(trayMenu());
}

// ---------- yardımcılar ----------
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
    default: { const s = JSON.stringify(i); return s === '{}' ? '' : s; }
  }
}

function detailOf(tool, i) {
  i = i && typeof i === 'object' ? i : {};
  const cut = (t, n) => (String(t || '').length > n ? String(t).slice(0, n) + '…' : String(t || ''));
  switch (tool) {
    case 'Bash': return cut(i.command, 900) + (i.description ? '\n# ' + i.description : '');
    case 'Write': return i.file_path + '\n\n' + cut(i.content, 700);
    case 'Edit': return i.file_path + '\n\n- ' + cut(i.old_string, 350).split('\n').join('\n- ') + '\n+ ' + cut(i.new_string, 350).split('\n').join('\n+ ');
    case 'MultiEdit': return i.file_path + '\n(' + I18N.plural('main.edits', (i.edits && i.edits.length) || 0) + ')';
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
    s = { id: e.session_id, cwd: e.cwd || '', name: '', status: 'idle', prompt: '', since: e.ts, updated: e.ts, started: e.ts,
      activity: [], tools: 0, totalTools: 0, current: null, lastText: '', transcript: '', lastRead: 0,
      seq: 0, todos: [], files: {}, toolCounts: {}, turns: 0, errors: 0 };
    sessions.set(s.id, s);
  }
  if (e.cwd) s.cwd = e.cwd;
  if (e.transcript_path) s.transcript = e.transcript_path;
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

// ---------- olay işleme ----------
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
      addActivity(s, { tool: 'Prompt', summary: s.prompt, ts: e.ts, done: true, input: { prompt: e.prompt || '' } });
      return null;
    case 'PreToolUse': {
      const inp = e.tool_input || {};
      s.status = 'working'; s.tools++; s.totalTools++;
      s.toolCounts[e.tool_name] = (s.toolCounts[e.tool_name] || 0) + 1;
      const fp = inp.file_path || inp.notebook_path;
      if (fp) {
        const f = (s.files[fp] = s.files[fp] || { reads: 0, writes: 0, last: 0 });
        if (e.tool_name === 'Read') f.reads++; else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(e.tool_name)) f.writes++;
        f.last = e.ts;
      }
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
        if (r && typeof r === 'object' && (r.interrupted || r.is_error)) { a.error = true; s.errors++; }
      }
      if (s.current && a && s.current === a) s.current = null;
      s.status = 'working';
      return null;
    }
    case 'Notification':
      if (e.notification_type === 'idle_prompt') return null;
      s.status = 'waiting'; s.message = e.message || T('main.waitingInput');
      return 'waiting';
    case 'Stop':
      dropPending(s.id, true);
      s.status = 'done'; s.doneAt = e.ts; s.current = null;
      readLastText(s).then(() => push(null));
      return 'done';
  }
  return null;
}

// ---------- pencereye gönder ----------
function publicPending() {
  return [...pending.values()].map(({ res, suggestions, ...p }) => ({ ...p, hasSug: !!(suggestions && suggestions.length) }));
}

function syncShortcuts() {
  const want = pending.size > 0;
  if (want === shortcutsOn) return;
  shortcutsOn = want;
  if (want) {
    const first = () => [...pending.keys()][0];
    globalShortcut.register('Control+Alt+Y', () => decide(first(), 'allow'));
    globalShortcut.register('Control+Alt+N', () => decide(first(), 'deny'));
  } else {
    globalShortcut.unregister('Control+Alt+Y');
    globalShortcut.unregister('Control+Alt+N');
  }
}

// ---------- görünürlük: yalnızca Claude Code oturumu varken görünür ----------
let hideTimer = null, emptySince = Date.now();
const wantVisible = () => sessions.size > 0 || pending.size > 0;
function syncVisibility() {
  if (!win || win.isDestroyed()) return;
  if (wantVisible()) {
    clearTimeout(hideTimer); hideTimer = null; emptySince = 0;
    media.setActive(true);
    if (!win.isVisible()) win.showInactive();
  } else {
    if (!emptySince) emptySince = Date.now();
    if (win.isVisible() && !hideTimer) hideTimer = setTimeout(() => { hideTimer = null; if (!wantVisible() && win && !win.isDestroyed()) { win.hide(); media.setActive(false); } }, 2500);
  }
}

// Claude Code süreci hâlâ çalışıyor mu? (SessionEnd göndermeden çökerse oturumlar takılı kalmasın)
function claudeAlive() {
  const ps = "@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'claude.exe' -and $_.CommandLine -notmatch 'AnthropicClaude|WindowsApps|--type=') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'claude-code') }).Count";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const n = parseInt(String(out).trim(), 10);
      resolve(err || Number.isNaN(n) ? true : n > 0); // emin değilsek canlı say
    });
  });
}

function push(notify) {
  syncShortcuts();
  syncVisibility();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state', { sessions: [...sessions.values()].map(publicSession), pending: publicPending(), notify });
}

function decide(id, behavior) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  const s = sessions.get(p.session_id);
  let body = '{}';
  if (behavior === 'allow' || behavior === 'always') {
    const decision = { behavior: 'allow' };
    if (behavior === 'always' && p.suggestions) decision.updatedPermissions = p.suggestions;
    body = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });
    if (s) s.status = 'working';
  } else if (behavior === 'deny') {
    body = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: T('main.denied') } } });
    if (s) s.status = 'working';
  }
  if (!p.res.writableEnded) { p.res.writeHead(200, { 'Content-Type': 'application/json' }); p.res.end(body); }
  push(null);
}

// ---------- sunucu ----------
function startServer() {
  http.createServer((req, res) => {
    if (req.method !== 'POST' || (req.url !== '/event' && req.url !== '/permission')) { res.writeHead(404); return res.end(); }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
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
        detail: detailOf(e.tool_name, e.tool_input), ts: e.ts || Date.now(), suggestions: e.permission_suggestions || null, res };
      pending.set(p.id, p);
      s.status = 'waiting'; s.message = T('main.waitingPermission', { tool: p.tool });
      res.on('close', () => { if (!res.writableEnded && pending.delete(p.id)) push(null); });
      push({ type: 'permission', id: s.id });
    });
  }).listen(PORT, '127.0.0.1');
}

// ---------- pencere ----------
const W0 = 940, H0 = 800;
function place() {
  const d = screen.getPrimaryDisplay();
  const W = Math.min(W0, d.bounds.width), H = Math.min(H0, d.bounds.height);
  win.setBounds({ x: Math.round(d.bounds.x + (d.bounds.width - W) / 2), y: d.bounds.y, width: W, height: H });
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
  win.loadFile('index.html');
  win.once('ready-to-show', () => { push(null); if (latestMedia) win.webContents.send('media', latestMedia); win.webContents.send('settings', settingsPayload()); });
  screen.on('display-metrics-changed', place);
}

function trayMenu() {
  const radio = (label, checked, click) => ({ label, type: 'radio', checked, click });
  return Menu.buildFromTemplate([
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
    { label: T('tray.demo'), click: () => win && win.webContents.send('demo') },
    { label: T('tray.clear'), click: () => { for (const id of sessions.keys()) dropPending(id, true); sessions.clear(); push(null); } },
    { type: 'separator' },
    { label: T('tray.quit'), click: () => app.quit() },
  ]);
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
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.updated > STALE_MS) sessions.delete(id);
  }, 60000);
  setInterval(async () => {
    if (!(await claudeAlive()) && sessions.size) {
      for (const id of sessions.keys()) dropPending(id, true);
      sessions.clear(); push(null);
    }
    if (AUTO && !wantVisible() && emptySince && Date.now() - emptySince > QUIT_MS) app.quit();
  }, +process.env.CC_CHECK_MS || 20000);
});

ipcMain.on('mouse-over', (_e, over) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('decide', (_e, id, behavior) => decide(id, behavior));
ipcMain.on('dismiss', (_e, id) => { dropPending(id, true); sessions.delete(id); push(null); });
ipcMain.on('media-cmd', (_e, cmd) => { if (/^(toggle|play|pause|next|prev|seek:d+)$/.test(String(cmd))) media.send(cmd); });
ipcMain.on('copy', (_e, text) => clipboard.writeText(String(text || '')));
ipcMain.handle('get-detail', (_e, sid, n) => {
  const s = sessions.get(sid); const a = s && s.activity.find((x) => x.n === n);
  return a ? { input: a.input || null, output: a.output || '' } : null;
});
ipcMain.handle('get-transcript', (_e, sid) => getTranscript(sid));
app.on('will-quit', () => { globalShortcut.unregisterAll(); media.setActive(false); });
app.on('window-all-closed', () => app.quit());
