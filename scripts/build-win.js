const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const name = `CC-Island-${pkg.version}-win-x64`;
const outDir = path.join(root, 'dist', name);
const zipPath = path.join(root, 'dist', `${name}.zip`);

const APP_FILES = [
  'package.json', 'main.js', 'preload.js', 'hook.js', 'install-hooks.js', 'media.js', 'media.ps1', 'system.ps1', 'wincal.ps1',
  'i18n.js', 'icons.js', 'island.js', 'renderer.js', 'widgets.js', 'settings.js', 'pet.js', 'index.html',
  'style.css', 'island.css', 'widgets.css', 'settings.css', 'tray.png',
];
const APP_DIRS = ['assets', 'lib', 'ui', 'bin'];

execFileSync(process.execPath, [path.join(__dirname, 'build-native.js')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
if (!fs.existsSync(path.join(root, 'ui', 'full.js'))) {
  console.error('UI build missing (ui/full.js).');
  process.exit(1);
}

if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
  console.error('Electron distribution not found. Run "npm install" first.');
  process.exit(1);
}

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.cpSync(electronDist, outDir, { recursive: true });
fs.renameSync(path.join(outDir, 'electron.exe'), path.join(outDir, 'CC Island.exe'));
fs.rmSync(path.join(outDir, 'resources', 'default_app.asar'), { force: true });

const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const f of APP_FILES) fs.copyFileSync(path.join(root, f), path.join(appDir, f));
for (const d of APP_DIRS) if (fs.existsSync(path.join(root, d))) fs.cpSync(path.join(root, d), path.join(appDir, d), { recursive: true });

fs.writeFileSync(path.join(outDir, 'README.txt'), [
  `CC Island ${pkg.version} (Windows x64)`,
  '',
  '1. Run "CC Island.exe". Nothing shows until a Claude Code session is running.',
  '2. To hook it into Claude Code, install Node.js (https://nodejs.org/) and run, in this folder:',
  '       node resources\\app\\install-hooks.js',
  '   Restart any open Claude Code sessions afterwards.',
  '3. Remove the hooks with:  node resources\\app\\install-hooks.js --remove',
  '',
  'Keep this folder where it is: the hooks point to resources\\app\\hook.js inside it.',
  'Source, docs and issues: https://github.com/momentxrdd/cc-island',
  '',
].join('\r\n'));

execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  `Compress-Archive -Path '${outDir}' -DestinationPath '${zipPath}' -CompressionLevel Optimal`,
], { stdio: 'inherit' });

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
console.log(`\nBuilt: ${path.relative(root, outDir)}  (exe: ${path.join(path.basename(outDir), 'CC Island.exe')})`);
console.log(`Zip:   ${path.relative(root, zipPath)}  (${mb(zipPath)} MB)`);
