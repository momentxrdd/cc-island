const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'native', 'cc-helper.cpp');
const outDir = path.join(root, 'bin');
const exe = path.join(outDir, 'cc-helper.exe');
const log = (m) => console.log('[build-native] ' + m);

if (process.platform !== 'win32') process.exit(0);
if (!process.argv.includes('--force') && fs.existsSync(exe) && fs.statSync(exe).mtimeMs >= fs.statSync(src).mtimeMs) process.exit(0);

function vcvars() {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) return null;
  try {
    const dir = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    const bat = dir && path.join(dir, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    return bat && fs.existsSync(bat) ? bat : null;
  } catch { return null; }
}

const bat = vcvars();
if (!bat) { log('MSVC bulunamadı; PowerShell izleyicileri kullanılacak (Visual Studio Build Tools + "C++ ile masaüstü geliştirme" kurulursa yerel yardımcı derlenir).'); process.exit(0); }

fs.mkdirSync(outDir, { recursive: true });
const obj = path.join(outDir, 'cc-helper.obj');
const cl = `cl /nologo /std:c++20 /EHsc /O1 /MT /permissive- /DUNICODE /D_UNICODE "${src}" /Fo"${obj}" /Fe"${exe}" ` +
  '/link /SUBSYSTEM:CONSOLE windowsapp.lib ole32.lib oleaut32.lib wbemuuid.lib user32.lib shell32.lib psapi.lib';
const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"call "${bat}" >nul && ${cl}"`], { cwd: outDir, encoding: 'utf8', windowsVerbatimArguments: true });
try { fs.unlinkSync(obj); } catch {}
if (r.status !== 0 || !fs.existsSync(exe)) {
  log('derleme başarısız; PowerShell izleyicileri kullanılacak.');
  console.log(((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /error|warning C4/.test(l)).slice(0, 20).join('\n'));
  try { fs.unlinkSync(exe); } catch {}
  process.exit(0);
}
log('bin/cc-helper.exe hazır (' + Math.round(fs.statSync(exe).size / 1024) + ' KB)');
