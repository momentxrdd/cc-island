const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'wincal.ps1');

function run(mode, args = {}) {
  const argv = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Mode', mode];
  for (const [k, v] of Object.entries(args)) argv.push('-' + k, String(v));
  return new Promise((resolve) => {
    execFile('powershell.exe', argv, { windowsHide: true, timeout: 25000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      const line = String(out || '').trim().split('\n').pop();
      try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: err ? String(err.message || err).split('\n')[0] : 'no output' }); }
    });
  });
}

const events = (days = 2, from = 0) => run('events', from ? { Days: days, From: Math.round(from) } : { Days: days });
let chain = Promise.resolve();
const focus = (on, minutes) => (chain = chain.then(() => run(on ? 'focus-start' : 'focus-stop', on ? { Minutes: Math.max(1, Math.round(minutes)) } : {})));

module.exports = { events, focus };
