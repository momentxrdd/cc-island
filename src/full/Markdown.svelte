<script>
  import { markdown } from './markdown.js';
  export let text = '';
  export let className = '';
  $: html = markdown(text);

  function onClick(e) {
    const a = e.target.closest && e.target.closest('a[data-md-link]');
    if (!a) return;
    e.preventDefault();
    if (window.ccApi && window.ccApi.openExternal) window.ccApi.openExternal(a.getAttribute('href'));
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="md {className}" on:click={onClick}>{@html html}</div>

<style>
  .md { font-size: 14px; line-height: 21px; color: var(--fds-text-primary); overflow-wrap: anywhere; user-select: text; }
  .md :global(> :first-child) { margin-top: 0; }
  .md :global(> :last-child) { margin-bottom: 0; }
  .md :global(p) { margin: 0 0 10px; }
  .md :global(h3), .md :global(h4), .md :global(h5), .md :global(h6) { margin: 16px 0 6px; font-weight: 600; line-height: 1.35; }
  .md :global(h3) { font-size: 17px; }
  .md :global(h4) { font-size: 15px; }
  .md :global(h5), .md :global(h6) { font-size: 14px; color: var(--fds-text-secondary); }
  .md :global(strong) { font-weight: 600; }
  .md :global(del) { color: var(--fds-text-secondary); }
  .md :global(a) { color: var(--fds-accent-text-primary, #99ebff); text-decoration: none; }
  .md :global(a:hover) { text-decoration: underline; }

  .md :global(code) {
    font-family: 'Cascadia Mono', 'Cascadia Code', Consolas, monospace; font-size: 12.5px; padding: 1px 5px; border-radius: 4px;
    background: var(--fds-control-fill-secondary, rgba(255,255,255,.08)); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.06));
  }
  .md :global(pre) {
    position: relative; margin: 8px 0 12px; padding: 10px 12px; border-radius: 6px; overflow-x: auto;
    background: var(--fds-solid-background-base, #1c1c1c); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08));
  }
  .md :global(pre[data-lang])::before {
    content: attr(data-lang); position: absolute; top: 4px; right: 8px; font-size: 10.5px; color: var(--fds-text-secondary); text-transform: lowercase;
  }
  .md :global(pre code) { padding: 0; background: none; box-shadow: none; font-size: 12.5px; line-height: 19px; white-space: pre; }

  .md :global(ul), .md :global(ol) { margin: 4px 0 10px; padding-left: 22px; }
  .md :global(li) { margin: 3px 0; }
  .md :global(li > ul), .md :global(li > ol) { margin: 2px 0 2px; }
  .md :global(ul > li::marker) { color: var(--fds-text-secondary); }
  .md :global(ol > li::marker) { color: var(--fds-text-secondary); font-variant-numeric: tabular-nums; }
  .md :global(li.task) { list-style: none; position: relative; }
  .md :global(li.task .cb) {
    position: absolute; left: -20px; top: 3px; width: 14px; height: 14px; border-radius: 3px;
    box-shadow: inset 0 0 0 1px var(--fds-control-strong-stroke-default, rgba(255,255,255,.5));
  }
  .md :global(li.task.done .cb) { background: var(--fds-accent-default, #60cdff); box-shadow: none; }
  .md :global(li.task.done .cb)::after {
    content: ''; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid var(--fds-text-on-accent-primary, #000);
    border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  .md :global(li.task.done) { color: var(--fds-text-secondary); }

  .md :global(blockquote) { margin: 8px 0 12px; padding: 2px 0 2px 12px; border-left: 3px solid var(--fds-accent-default, #60cdff); color: var(--fds-text-secondary); }
  .md :global(hr) { border: 0; height: 1px; margin: 14px 0; background: var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }

  .md :global(.md-table) { margin: 8px 0 12px; overflow-x: auto; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08)); }
  .md :global(table) { border-collapse: collapse; width: 100%; font-size: 13px; line-height: 18px; }
  .md :global(th), .md :global(td) { padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }
  .md :global(th) { font-weight: 600; background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.04)); }
  .md :global(tr:last-child td) { border-bottom: 0; }
</style>
