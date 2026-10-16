<script>
  export let diff = [];
  export let maxHeight = 420;
  let open = {};
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const dir = (p) => { const s = String(p || '').replace(/\\/g, '/'); const i = s.lastIndexOf('/'); return i > 0 ? s.slice(0, i) : ''; };
</script>

<div class="dv">
  {#each diff as f, fi}
    <div class="file">
      <button type="button" class="fh" aria-expanded={open[fi] !== false} on:click={() => (open[fi] = open[fi] === false)}>
        <span class="chev" class:closed={open[fi] === false}>▾</span>
        <b title={f.file}>{base(f.file)}</b>
        <span class="dir" title={f.file}>{dir(f.file)}</span>
        {#if f.isNew}<span class="tag">yeni dosya</span>{/if}
        {#if f.deleted}<span class="tag del">silinecek</span>{/if}
        {#if f.located === false}<span class="tag" title="Değiştirilecek metin dosyada bulunamadı; satır numaraları yaklaşık">konum bulunamadı</span>{/if}
        <span class="add">+{f.added || 0}</span><span class="rem">−{f.removed || 0}</span>
      </button>
      {#if open[fi] !== false}
        <div class="body" style="max-height:{maxHeight}px">
          {#each f.hunks as h, hi}
            {#if hi > 0}<div class="gap">⋯</div>{/if}
            {#each h.lines as l}
              <div class="ln" class:a={l.t === '+'} class:r={l.t === '-'}>
                <span class="no">{l.o ?? ''}</span><span class="no">{l.n ?? ''}</span>
                <span class="sg">{l.t === ' ' ? '' : l.t === '-' ? '−' : '+'}</span>
                <code>{l.s || ' '}</code>
              </div>
            {/each}
          {/each}
          {#if f.truncated}<div class="gap">Fark kısaltıldı</div>{/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .dv { display: flex; flex-direction: column; gap: 8px; }
  .file { border-radius: 6px; overflow: hidden; background: var(--fds-solid-background-base, #1c1c1c); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08)); }
  .fh { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 0; background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.04));
    color: var(--fds-text-primary); font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; }
  .fh:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }
  .chev { color: var(--fds-text-secondary); transition: transform .15s; display: inline-block; }
  .chev.closed { transform: rotate(-90deg); }
  .fh b { font-weight: 600; white-space: nowrap; }
  .dir { min-width: 0; flex: 1; color: var(--fds-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; }
  .tag { padding: 0 6px; border-radius: 6px; font-size: 11px; background: rgba(255,255,255,.08); color: var(--fds-text-secondary); white-space: nowrap; }
  .tag.del { color: #ff9a9a; }
  .add { color: #6ccb5f; font-variant-numeric: tabular-nums; }
  .rem { color: #ff7b7b; font-variant-numeric: tabular-nums; }
  .body { overflow: auto; font-family: 'Cascadia Mono', 'Cascadia Code', Consolas, monospace; font-size: 12px; line-height: 18px; }
  .ln { display: flex; white-space: pre; min-width: max-content; }
  .no { flex: none; width: 40px; padding-right: 8px; text-align: right; color: var(--fds-text-disabled, #5c5c62); user-select: none; }
  .sg { flex: none; width: 14px; color: var(--fds-text-secondary); user-select: none; }
  code { font: inherit; padding-right: 12px; color: var(--fds-text-primary); }
  .ln.a { background: rgba(46,160,67,.15); } .ln.a .sg, .ln.a code { color: #aef0b8; }
  .ln.r { background: rgba(248,81,73,.14); } .ln.r .sg, .ln.r code { color: #ffbdb8; }
  .gap { padding: 2px 10px; color: var(--fds-text-secondary); background: rgba(255,255,255,.03); font-size: 11px; }
</style>
