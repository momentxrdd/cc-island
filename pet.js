(function () {
  const FILES = ['idle-living', 'sleeping', 'waving', 'working-thinking', 'working-typing', 'reading', 'working-building', 'working-testing',
    'working-pushing', 'working-deploying', 'detective', 'working-juggling', 'working-tool-calling', 'notification', 'idea', 'celebrating',
    'happy', 'error', 'working-context-full', 'working-conducting', 'working-debugger'];
  const src = (name) => `assets/pets/${FILES.includes(name) ? name : 'idle-living'}.svg`;

  const BASH = [
    [/\b(test|jest|vitest|pytest|mocha|playwright|cypress|go test|cargo test|phpunit|rspec)\b/i, 'working-testing'],
    [/\bgit\s+(push|commit|merge|rebase|pull)\b|\bgh\s+pr\b/i, 'working-pushing'],
    [/\b(deploy|vercel|netlify|fly\s+deploy|wrangler|kubectl|helm|terraform|docker\s+push)\b/i, 'working-deploying'],
    [/\b(debug|gdb|lldb|node\s+--inspect|strace)\b/i, 'working-debugger'],
  ];

  function forTool(tool, summary) {
    if (!tool) return 'working-thinking';
    if (tool === 'Bash' || tool === 'PowerShell') {
      for (const [re, n] of BASH) if (re.test(summary || '')) return n;
      return 'working-building';
    }
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return 'working-typing';
    if (['Read', 'Grep', 'Glob', 'LS'].includes(tool)) return 'reading';
    if (tool === 'WebFetch' || tool === 'WebSearch') return 'detective';
    if (tool === 'Task' || tool === 'Agent') return 'working-juggling';
    if (tool === 'TodoWrite') return 'working-conducting';
    if (tool === 'AskUserQuestion') return 'idea';
    return 'working-tool-calling';
  }

  function forState({ sessions, pending, now }) {
    now = now || Date.now();
    if (pending && pending.length) return pending.every((p) => p.questions) ? 'idea' : 'notification';
    const work = sessions.filter((s) => s.status === 'working');
    if (work.length > 1) return 'working-juggling';
    if (work.length) {
      const s = work[0];
      return s.current ? forTool(s.current.tool, s.current.summary) : 'working-thinking';
    }
    const waiting = sessions.find((s) => s.status === 'waiting');
    if (waiting) return 'notification';
    const done = sessions.filter((s) => s.status === 'done' && s.doneAt);
    const last = done.length ? Math.max(...done.map((s) => s.doneAt)) : 0;
    if (last && now - last < 6000) return 'celebrating';
    if (last && now - last < 90000) return 'happy';
    if (!sessions.length) return 'sleeping';
    const recent = Math.max(...sessions.map((s) => s.updated || 0));
    return now - recent > 10 * 60000 ? 'sleeping' : 'idle-living';
  }

  function nextChange({ sessions, now }) {
    now = now || Date.now();
    const t = sessions.filter((s) => s.status === 'done' && s.doneAt).map((s) => s.doneAt).flatMap((d) => [d + 6000, d + 90000]);
    const fut = t.filter((x) => x > now);
    return fut.length ? Math.min(...fut) - now + 30 : 0;
  }

  function html(name, size, cls) {
    return `<span class="pet${cls ? ' ' + cls : ''}" data-pet="${name}" style="--ps:${size}px" aria-hidden="true"><img src="${src(name)}" alt="" draggable="false"></span>`;
  }
  function set(el, name) {
    if (!el || el.dataset.pet === name) return;
    el.dataset.pet = name;
    const img = el.firstElementChild;
    if (img) img.src = src(name);
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  }

  window.CCPet = { FILES, src, forTool, forState, nextChange, html, set };
})();
