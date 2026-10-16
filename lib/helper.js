const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXE = path.join(__dirname, '..', 'bin', 'cc-helper.exe').replace('app.asar', 'app.asar.unpacked');
let native = null;
const hasNative = () => (native == null ? (native = fs.existsSync(EXE)) : native);

function spawnWatcher(mode, args = {}) {
  const opts = { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
  if (hasNative()) {
    const argv = [mode];
    if (args.source) argv.push('--source', args.source);
    if (args.selfPid) argv.push('--self-pid', String(args.selfPid));
    return spawn(EXE, argv, opts);
  }
  const ps = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', mode + '.ps1')];
  if (args.source) ps.push('-Source', args.source);
  if (args.selfPid) ps.push('-SelfPid', String(args.selfPid));
  return spawn('powershell.exe', ps, opts);
}

function runOnce(args, timeout = 8000) {
  return new Promise((resolve) => {
    if (!hasNative()) return resolve(null);
    execFile(EXE, args, { windowsHide: true, timeout }, (err, out) => {
      const line = String(out || '').trim().split('\n').pop();
      try { resolve(JSON.parse(line)); } catch { resolve(null); }
    });
  });
}

module.exports = { spawnWatcher, hasNative, runOnce };
