const AGENTS = {
  claude: { label: 'Claude Code' },
  codex: { label: 'Codex' },
  gemini: { label: 'Gemini CLI' },
  cursor: { label: 'Cursor' },
};

const GEMINI_TOOLS = {
  run_shell_command: 'Bash', write_file: 'Write', replace: 'Edit', edit: 'Edit', read_file: 'Read', read_many_files: 'Read',
  glob: 'Glob', search_file_content: 'Grep', grep_search: 'Grep', list_directory: 'LS', web_fetch: 'WebFetch',
  google_web_search: 'WebSearch', write_todos: 'TodoWrite', save_memory: 'Memory',
};
const CURSOR_TOOLS = { Shell: 'Bash', run_terminal_cmd: 'Bash', read_file: 'Read', edit_file: 'Edit', search_replace: 'Edit', write: 'Write',
  grep: 'Grep', codebase_search: 'Grep', glob_file_search: 'Glob', web_search: 'WebSearch', Delete: 'Write', delete_file: 'Write' };

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const winPath = (p) => (typeof p === 'string' ? p.replace(/^\/([a-zA-Z]:[\\/])/, '$1') : p);

function mapInput(tool, inp) {
  const i = { ...obj(inp) };
  if (!i.file_path) i.file_path = winPath(i.absolute_path || i.path || i.target_file || i.filePath) || undefined;
  if (tool === 'Bash' && Array.isArray(i.command)) i.command = i.command.join(' ');
  if (tool === 'Grep' && !i.pattern) i.pattern = i.query || i.regex;
  if (tool === 'Glob' && !i.pattern) i.pattern = i.glob_pattern;
  if (tool === 'WebFetch' && !i.url) i.url = i.prompt;
  if (tool === 'WebSearch' && !i.query) i.query = i.search_term;
  if (!['Read', 'Write', 'Edit', 'MultiEdit'].includes(tool) && i.file_path && !obj(inp).file_path) delete i.file_path;
  return i;
}

function codexTool(name, inp) {
  const i = obj(inp);
  if (name === 'apply_patch' || name === 'ApplyPatch') {
    const text = [i.input, i.patch, i.command].find((v) => typeof v === 'string') || '';
    const m = /\*\*\* (Update|Add|Delete) File: (.+)/.exec(text);
    return { tool: m && m[1] === 'Add' ? 'Write' : 'Edit', input: { file_path: m ? m[2].trim() : '', patch: text } };
  }
  if (name === 'shell' || name === 'exec_command' || name === 'local_shell') return { tool: 'Bash', input: mapInput('Bash', i) };
  return { tool: name, input: mapInput(name, i) };
}

function normalize(agent, d) {
  d = obj(d);
  const ev = d.hook_event_name;
  if (agent === 'claude') {
    return { event: ev, session_id: d.session_id, cwd: d.cwd, transcript_path: d.transcript_path, prompt: d.prompt, message: d.message,
      notification_type: d.notification_type, tool_name: d.tool_name, tool_input: d.tool_input, tool_response: d.tool_response,
      tool_use_id: d.tool_use_id, permission_suggestions: d.permission_suggestions };
  }
  const sid = d.session_id || d.conversation_id;
  if (!sid) return null;
  const base = { session_id: agent + ':' + sid };

  if (agent === 'codex') {
    const t = d.tool_name ? codexTool(d.tool_name, d.tool_input) : {};
    const map = { SessionStart: 1, SessionEnd: 1, UserPromptSubmit: 1, PreToolUse: 1, PostToolUse: 1, PermissionRequest: 1, Stop: 1 };
    if (ev === 'Interrupt') return { ...base, cwd: d.cwd, event: 'Stop' };
    if (!map[ev]) return null;
    return { ...base, event: ev, cwd: d.cwd, prompt: d.prompt, tool_name: t.tool, tool_input: t.input, tool_response: d.tool_response,
      tool_use_id: d.tool_use_id, last_message: d.last_assistant_message };
  }

  if (agent === 'gemini') {
    const tool = d.tool_name && (GEMINI_TOOLS[d.tool_name] || d.tool_name);
    const common = { ...base, cwd: d.cwd };
    switch (ev) {
      case 'SessionStart': return { ...common, event: 'SessionStart' };
      case 'SessionEnd': return { ...common, event: 'SessionEnd' };
      case 'BeforeAgent': return { ...common, event: 'UserPromptSubmit', prompt: d.prompt };
      case 'BeforeTool': return { ...common, event: 'PreToolUse', tool_name: tool, tool_input: mapInput(tool, d.tool_input) };
      case 'AfterTool': return { ...common, event: 'PostToolUse', tool_name: tool, tool_input: mapInput(tool, d.tool_input), tool_response: d.tool_response };
      case 'AfterAgent': return { ...common, event: 'Stop', last_message: d.prompt_response };
      case 'Notification':
        return { ...common, event: 'Notification', notification_type: d.notification_type === 'ToolPermission' ? 'permission_prompt' : d.notification_type, message: d.message };
    }
    return null;
  }

  if (agent === 'cursor') {
    const roots = Array.isArray(d.workspace_roots) ? d.workspace_roots : [];
    const common = { ...base, cwd: winPath(d.cwd || roots[0] || '') };
    const tool = d.tool_name && (CURSOR_TOOLS[d.tool_name] || d.tool_name);
    switch (ev) {
      case 'sessionStart': return d.is_background_agent ? null : { ...common, event: 'SessionStart' };
      case 'sessionEnd': return { ...common, event: 'SessionEnd' };
      case 'beforeSubmitPrompt': return { ...common, event: 'UserPromptSubmit', prompt: d.prompt };
      case 'postToolUse': return { ...common, event: 'ToolDone', tool_name: tool, tool_input: mapInput(tool, d.tool_input), tool_response: d.tool_output, tool_use_id: d.tool_use_id };
      case 'afterAgentResponse': return { ...common, event: 'AssistantText', last_message: d.text };
      case 'stop': return { ...common, event: 'Stop', error: d.status === 'error' };
    }
    return null;
  }
  return null;
}

function reply(agent, d, out) {
  const ev = obj(d).hook_event_name;
  if (agent === 'cursor') return ev === 'beforeSubmitPrompt' ? '{"continue":true}' : '{}';
  if (agent === 'gemini') return '{}';
  if (!out) return '';
  let o; try { o = JSON.parse(out); } catch { return ''; }
  if (!o || !o.hookSpecificOutput) return '';
  if (agent === 'codex') {
    const dec = obj(o.hookSpecificOutput.decision);
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
      decision: dec.behavior === 'deny' ? { behavior: 'deny', message: dec.message || 'Denied' } : { behavior: 'allow' } } });
  }
  return JSON.stringify(o);
}

module.exports = { AGENTS, normalize, reply };
