const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { normalize, reply } = require('./lib/agents');

const PORT = +process.env.CC_PORT || 47321;
const AGENT = ((process.argv.find((a) => a.startsWith('--agent=')) || '').slice(8) || 'claude').toLowerCase();
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
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    spawn(exe, [...args, '--auto'], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
    return true;
  } catch { return false; }
}

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
  if (process.env.CC_DEBUG) { try { fs.appendFileSync(path.join(require('os').tmpdir(), 'cc-island-hook.log'), raw.trim() + '\n'); } catch {} }

  const trunc = (v, n = 8000) => {
    if (typeof v === 'string') return v.length > n ? v.slice(0, n) + '\n…(truncated)' : v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => trunc(x, n));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trunc(x, n)]));
    return v;
  };

  const e = normalize(AGENT, data);
  if (!e) { const r = reply(AGENT, data, null); if (r) process.stdout.write(r); return process.exit(0); }
  const isPerm = e.event === 'PermissionRequest';
  const body = JSON.stringify({
    ...e,
    agent: AGENT,
    tool_input: trunc(e.tool_input),
    tool_response: trunc(e.tool_response, 12000),
    last_message: typeof e.last_message === 'string' ? e.last_message.slice(0, 3000) : undefined,
    ppid: process.ppid,
    ts: Date.now(),
  });
  const done = (out) => { const r = reply(AGENT, data, out); if (r) process.stdout.write(r); process.exit(0); };

  post(isPerm ? '/permission' : '/event', body, isPerm ? 0 : 1500, (err, out) => {
    if (err) {
      if (e.event === 'SessionStart' && launchApp()) {
        try {
          const child = spawn(process.execPath, [__filename, '--deliver'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
          child.stdin.end(body);
          child.unref();
        } catch {}
      }
      return done(null);
    }
    done(isPerm ? out : null);
  });
});
