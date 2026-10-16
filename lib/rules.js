const FILE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const SHELL_TOOLS = ['Bash', 'PowerShell'];
const CHAINED = /[;&|`\n<>]|\$\(/;
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function globRe(glob, ci) {
  const src = String(glob).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*');
  return new RegExp('^' + src + '$', ci ? 'i' : '');
}

function subjectOf(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  if (SHELL_TOOLS.includes(tool)) return String(i.command || '').trim();
  if (FILE_TOOLS.includes(tool)) return String(i.file_path || i.notebook_path || '');
  if (tool === 'WebFetch') return String(i.url || '');
  if (tool === 'WebSearch') return String(i.query || '');
  return '';
}

function matches(rule, tool, input, cwd) {
  if (rule.tool !== '*' && rule.tool !== tool) return false;
  if (rule.cwd && !(norm(cwd) + '/').startsWith(norm(rule.cwd) + '/')) return false;
  const pat = String(rule.pattern || '').trim();
  if (!pat || pat === '*') return !(rule.action === 'allow' && SHELL_TOOLS.includes(tool) && pat === '*' && CHAINED.test(subjectOf(tool, input)));
  const subj = subjectOf(tool, input);
  if (FILE_TOOLS.includes(tool)) {
    const full = norm(subj), rel = cwd && full.startsWith(norm(cwd) + '/') ? full.slice(norm(cwd).length + 1) : full;
    const re = globRe(norm(pat), true);
    return re.test(full) || re.test(rel);
  }
  if (rule.action === 'allow' && SHELL_TOOLS.includes(tool) && pat.includes('*') && CHAINED.test(subj)) return false;
  return globRe(pat, false).test(subj);
}

function find(rules, tool, input, cwd) {
  if (!Array.isArray(rules) || tool === 'AskUserQuestion') return null;
  return rules.find((r) => r.action === 'deny' && matches(r, tool, input, cwd))
    || rules.find((r) => r.action === 'allow' && matches(r, tool, input, cwd)) || null;
}

const SUBCOMMAND = /^(npm|npx|pnpm|yarn|bun|git|gh|cargo|go|dotnet|python|python3|py|pip|uv|node|deno|make|docker|kubectl)$/i;
function suggest(tool, input) {
  if (SHELL_TOOLS.includes(tool)) {
    const t = subjectOf(tool, input).split(/\s+/).filter(Boolean);
    if (!t.length) return '';
    return (t[1] && SUBCOMMAND.test(t[0]) && !t[1].startsWith('-') ? t[0] + ' ' + t[1] : t[0]) + '*';
  }
  if (tool === 'WebFetch') { try { return new URL(String((input && input.url) || '')).origin + '/*'; } catch { return ''; } }
  return '';
}

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((r, i) => ({
    id: String((r && r.id) || Date.now().toString(36) + i).slice(0, 40),
    action: r && r.action === 'deny' ? 'deny' : 'allow',
    tool: /^[\w*:.-]{1,80}$/.test(String(r && r.tool)) ? String(r.tool) : '*',
    pattern: String((r && r.pattern) || '').slice(0, 300),
    cwd: String((r && r.cwd) || '').slice(0, 500),
  }));
}

module.exports = { find, matches, suggest, sanitize, subjectOf };
