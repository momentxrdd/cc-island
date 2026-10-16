const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, t, u) => {
    const url = u.replace(/&amp;/g, '&');
    return /^(https?:|mailto:)/i.test(url) ? `<a href="${esc(url)}" data-md-link>${t}</a>` : t;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (m, pre, u) => `${pre}<a href="${u}" data-md-link>${u}</a>`);
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cellsOf = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function markdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };

  while (i < lines.length) {
    const l = lines[i];

    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(l);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s*' + fence[1] + '\\s*$').test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre${fence[2] ? ` data-lang="${esc(fence[2])}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!l.trim()) { flush(); i++; continue; }

    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) { flush(); const n = Math.min(6, h[1].length + 2); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }

    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cellsOf(l);
      const align = cellsOf(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cellsOf(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] || '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    if (/^\s*>/.test(l)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) { items.push({ ind: m[1].replace(/\t/g, '  ').length, ord: /\d/.test(m[2]), start: parseInt(m[2], 10), text: m[3] }); i++; continue; }
        if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !/^\s*```/.test(lines[i])) { items[items.length - 1].text += '\n' + lines[i].trim(); i++; continue; }
        break;
      }
      out.push(list(items, 0, items.length));
      continue;
    }

    para.push(l);
    i++;
  }
  flush();
  return out.join('');
}

function list(items, from, to) {
  if (from >= to) return '';
  const base = items[from].ind;
  const ord = items[from].ord;
  let html = ord ? `<ol${items[from].start > 1 ? ` start="${items[from].start}"` : ''}>` : '<ul>';
  let k = from;
  while (k < to) {
    const it = items[k];
    if (it.ind <= base && it.ord !== ord) return html + (ord ? '</ol>' : '</ul>') + list(items, k, to);
    let j = k + 1;
    while (j < to && items[j].ind > base) j++;
    const task = /^\[( |x|X)\]\s+(.*)$/s.exec(it.text);
    const body = (task ? task[2] : it.text).split('\n').map(inline).join('<br>');
    html += task
      ? `<li class="task${task[1] !== ' ' ? ' done' : ''}"><span class="cb" aria-hidden="true"></span>${body}${list(items, k + 1, j)}</li>`
      : `<li>${body}${list(items, k + 1, j)}</li>`;
    k = j;
  }
  return html + (ord ? '</ol>' : '</ul>');
}
