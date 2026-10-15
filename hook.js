// Claude Code hook: stdin'deki olayı yerel CC Island sunucusuna iletir.
//  - PermissionRequest: kararı bekler ve stdout'a yazar. Uygulama kapalıysa sessizce çıkar (normal onay penceresi açılır).
//  - SessionStart: ada kapalıysa onu arka planda başlatır; olay, ada hazır olunca ayrı bir süreçle iletilir
//    (Claude Code'un açılışı beklemez).
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = +process.env.CC_PORT || 47321;
const DELIVER = process.argv.includes('--deliver');

function post(urlPath, body, timeout, cb) {
  const req = http.request(
    { host: '127.0.0.1', port: PORT, path: urlPath, method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => cb(null, out));
    }
  );
  req.on('error', (e) => cb(e));
  req.on('timeout', () => { req.destroy(); cb(new Error('timeout')); });
  req.end(body);
}

// The running app writes its own executable path to launch.json (see main.js), so this works for both
// `npm start` and the packaged build. Falls back to the local Electron binary for development.
function launchTarget() {
  try {
    const f = path.join(process.env.APPDATA || '', 'cc-island', 'launch.json');
    const t = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (t && t.exe) return { exe: t.exe, args: Array.isArray(t.args) ? t.args : [] };
  } catch {}
  return { exe: path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [__dirname] };
}

function launchApp() {
  const { exe, args } = launchTarget();
  if (!fs.existsSync(exe)) return false;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // bazı terminallerde set edilir ve Electron'u düz node gibi çalıştırır
  try {
    spawn(exe, [...args, '--auto'], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
    return true;
  } catch { return false; }
}

// ---- teslim modu: ada ayağa kalkana kadar dener, olayı iletir, çıkar ----
if (DELIVER) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let tries = 0;
    const attempt = () => post('/event', raw, 1500, (err) => {
      if (!err || ++tries > 40) process.exit(0);
      setTimeout(attempt, 250);
    });
    attempt();
  });
  return;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(raw); } catch {}

  const trunc = (v, n = 8000) => {
    if (typeof v === 'string') return v.length > n ? v.slice(0, n) + '\n…(truncated)' : v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => trunc(x, n));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trunc(x, n)]));
    return v;
  };

  const isPerm = data.hook_event_name === 'PermissionRequest';
  const body = JSON.stringify({
    event: data.hook_event_name,
    session_id: data.session_id,
    cwd: data.cwd,
    transcript_path: data.transcript_path,
    prompt: data.prompt,
    message: data.message,
    notification_type: data.notification_type,
    tool_name: data.tool_name,
    tool_input: trunc(data.tool_input),
    tool_response: trunc(data.tool_response, 12000),
    tool_use_id: data.tool_use_id,
    permission_suggestions: data.permission_suggestions,
    ts: Date.now(),
  });

  post(isPerm ? '/permission' : '/event', body, isPerm ? 0 : 1500, (err, out) => {
    if (err) {
      // ada kapalı: yeni bir Claude Code oturumu açılıyorsa başlat ve olayı sonradan ilet
      if (data.hook_event_name === 'SessionStart' && launchApp()) {
        try {
          const child = spawn(process.execPath, [__filename, '--deliver'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
          child.stdin.end(body);
          child.unref();
        } catch {}
      }
      return process.exit(0);
    }
    if (isPerm) {
      try {
        const o = JSON.parse(out);
        if (o && o.hookSpecificOutput) process.stdout.write(JSON.stringify(o));
      } catch {}
    }
    process.exit(0);
  });
});
