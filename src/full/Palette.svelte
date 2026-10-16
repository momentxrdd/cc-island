<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Icon from './Icon.svelte';

  export let open = false;
  export let commands = [];
  const dispatch = createEventDispatcher();

  let query = '', idx = 0, input, list;
  $: if (open) { query = ''; idx = 0; tick().then(() => input && input.focus()); }

  const low = (s) => String(s || '').toLocaleLowerCase('tr');
  function score(c, q) {
    if (!q) return 1;
    const t = low(c.title + ' ' + (c.hint || '') + ' ' + (c.keywords || ''));
    if (t.includes(q)) return 100 - t.indexOf(q);
    let i = 0, s = 0;
    for (const ch of q) { const j = t.indexOf(ch, i); if (j < 0) return 0; s += j === i ? 2 : 1; i = j + 1; }
    return s;
  }
  $: q = low(query.trim());
  $: shown = commands.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.c);
  $: if (idx >= shown.length) idx = Math.max(0, shown.length - 1);
  $: groups = (() => { const g = []; shown.forEach((c, i) => { const last = g[g.length - 1]; if (!last || last.name !== c.group) g.push({ name: c.group, items: [] }); g[g.length - 1].items.push({ c, i }); }); return g; })();

  function run(c) { if (!c) return; dispatch('close'); c.run(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); dispatch('close'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % Math.max(1, shown.length); scrollTo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + shown.length) % Math.max(1, shown.length); scrollTo(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(shown[idx]); }
  }
  function scrollTo() { tick().then(() => { const el = list && list.querySelector('[data-i="' + idx + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }); }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="scrim" on:click={() => dispatch('close')}>
    <div class="pal" role="dialog" aria-label="Komut paleti" on:click|stopPropagation>
      <div class="search">
        <Icon name="search" size={16} />
        <input bind:this={input} bind:value={query} on:keydown={onKey} placeholder="Komut, oturum ya da işlem ara…" aria-label="Komut ara"
          role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={'pal-' + idx} />
        <kbd>Esc</kbd>
      </div>
      <div class="list" id="pal-list" role="listbox" bind:this={list}>
        {#each groups as g}
          <div class="grp">{g.name}</div>
          {#each g.items as { c, i }}
            <button type="button" id={'pal-' + i} role="option" aria-selected={i === idx} class="it" class:sel={i === idx} data-i={i}
              on:mousemove={() => (idx = i)} on:click={() => run(c)}>
              <span class="ic"><Icon name={c.icon || 'chevronRight'} size={16} /></span>
              <span class="tt">{c.title}</span>
              {#if c.hint}<span class="hint">{c.hint}</span>{/if}
            </button>
          {/each}
        {:else}
          <div class="none">Sonuç yok</div>
        {/each}
      </div>
      <div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> gez</span><span><kbd>Enter</kbd> çalıştır</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Space</kbd></span></div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: absolute; inset: 0; z-index: 50; display: flex; justify-content: center; align-items: flex-start; padding-top: 56px;
    background: rgba(0,0,0,.32); animation: fade .12s ease-out; }
  .pal { width: min(560px, calc(100% - 32px)); max-height: calc(100% - 96px); display: flex; flex-direction: column; border-radius: 8px; overflow: hidden;
    background: var(--fds-solid-background-quarternary, #2c2c2c); box-shadow: 0 16px 48px rgba(0,0,0,.45), inset 0 0 0 1px var(--fds-surface-stroke-flyout, rgba(255,255,255,.1));
    animation: pop .16s cubic-bezier(.2,.8,.2,1); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { transform: translateY(-8px) scale(.98); opacity: 0; } }
  .search { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 48px; color: var(--fds-text-secondary);
    border-bottom: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: 15px; color: var(--fds-text-primary); }
  .search input::placeholder { color: var(--fds-text-secondary); }
  kbd { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 4px; font: 11px/18px 'Segoe UI', sans-serif; text-align: center;
    background: var(--fds-control-fill-secondary, rgba(255,255,255,.08)); color: var(--fds-text-secondary); box-shadow: inset 0 -1px 0 rgba(0,0,0,.3); }
  .list { overflow-y: auto; padding: 6px; }
  .grp { padding: 8px 10px 4px; font-size: 12px; font-weight: 600; color: var(--fds-text-secondary); }
  .it { width: 100%; display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 10px; border: 0; border-radius: 4px; background: none;
    color: var(--fds-text-primary); font: inherit; font-size: 14px; text-align: left; cursor: pointer; position: relative; }
  .it.sel { background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.06)); }
  .it.sel::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: var(--fds-accent-default, #60cdff); }
  .ic { color: var(--fds-text-secondary); display: grid; place-items: center; }
  .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint { font-size: 12px; color: var(--fds-text-secondary); white-space: nowrap; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
  .none { padding: 18px; text-align: center; color: var(--fds-text-secondary); font-size: 13px; }
  .foot { display: flex; gap: 16px; padding: 8px 14px; font-size: 12px; color: var(--fds-text-secondary); border-top: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }
  .foot span { display: inline-flex; gap: 3px; align-items: center; }
  .foot span:last-child { margin-left: auto; }
</style>
