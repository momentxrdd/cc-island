<script>
  import { Button, SegmentedControl, SegmentedControlButton } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';

  export let rules = [];
  export let projects = [];

  const TOOLS = [['Bash', 'Komut (Bash)'], ['Edit', 'Dosya düzenleme'], ['Write', 'Dosya yazma'], ['Read', 'Dosya okuma'],
    ['WebFetch', 'Web sayfası'], ['WebSearch', 'Web araması'], ['*', 'Tüm araçlar']];
  const toolLabel = (t) => (TOOLS.find((x) => x[0] === t) || [t, t])[1];
  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p;
  const save = (list) => window.ccApi && window.ccApi.setRules && window.ccApi.setRules(list);

  let action = 'allow', tool = 'Bash', pattern = '', cwd = '';
  $: scopes = [...new Set([...projects, ...rules.map((r) => r.cwd)].filter(Boolean))];
  $: placeholder = tool === 'Bash' ? 'ör. npm test*  ya da  git status' : ['Edit', 'Write', 'Read'].includes(tool) ? 'ör. src/*  (boş: tüm dosyalar)'
    : tool === 'WebFetch' ? 'ör. https://docs.github.com/*' : 'boş: hepsi';
  $: risky = action === 'allow' && (tool === 'Bash' || tool === '*') && (!pattern.trim() || pattern.trim() === '*');

  function add() {
    save([...rules, { id: Date.now().toString(36), action, tool, pattern: pattern.trim(), cwd }]);
    pattern = '';
  }
  const remove = (id) => save(rules.filter((r) => r.id !== id));
</script>

<div class="rules">
  {#if rules.length}
    <ul class="list">
      {#each [...rules].sort((a, b) => (a.action === b.action ? 0 : a.action === 'deny' ? -1 : 1)) as r (r.id)}
        <li>
          <span class="badge" class:deny={r.action === 'deny'}><Icon name={r.action === 'deny' ? 'x' : 'check'} size={12} />{r.action === 'deny' ? 'Engelle' : 'İzin ver'}</span>
          <div class="txt">
            <div class="what">{toolLabel(r.tool)}{#if r.pattern}<code>{r.pattern}</code>{/if}</div>
            <div class="where" title={r.cwd}>{r.cwd ? base(r.cwd) + ' projesinde' : 'Tüm projelerde'}</div>
          </div>
          <button type="button" class="del" aria-label="Kuralı sil" title="Sil" on:click={() => remove(r.id)}><Icon name="trash" size={16} /></button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">Henüz kural yok. İzin kartındaki <Icon name="zap" size={12} /> düğmesiyle de "bu projede hep izin ver" kuralı eklenebilir.</p>
  {/if}

  <div class="form">
    <SegmentedControl bind:value={action}>
      <SegmentedControlButton value="allow">İzin ver</SegmentedControlButton>
      <SegmentedControlButton value="deny">Engelle</SegmentedControlButton>
    </SegmentedControl>
    <select bind:value={tool} aria-label="Araç">
      {#each TOOLS as [v, l]}<option value={v}>{l}</option>{/each}
    </select>
    <input bind:value={pattern} {placeholder} aria-label="Kalıp" maxlength="300" on:keydown={(e) => e.key === 'Enter' && add()} />
    <select bind:value={cwd} aria-label="Kapsam">
      <option value="">Tüm projeler</option>
      {#each scopes as p}<option value={p}>{base(p)}</option>{/each}
    </select>
    <Button variant="accent" on:click={add}>Ekle</Button>
  </div>
  {#if risky}<p class="warn">Bu kural her komutu sormadan çalıştırır. Yine de zincirlenmiş komutlar (&&, ;, |) sorulmaya devam eder.</p>{/if}
  <p class="hint">Engelleme kuralları önce bakılır. <code>*</code> herhangi bir metin demek.</p>
</div>

<style>
  .rules { display: flex; flex-direction: column; gap: 10px; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  li { display: flex; align-items: center; gap: 12px; padding: 6px 4px 6px 0; border-radius: 4px; }
  li:hover { background: var(--fds-subtle-fill-secondary); }
  .badge { display: inline-flex; align-items: center; gap: 4px; width: 78px; flex: none; justify-content: center; height: 22px; border-radius: 11px;
    font-size: 12px; font-weight: 600; background: rgba(108, 203, 95, .16); color: #6ccb5f; }
  .badge.deny { background: rgba(255, 153, 164, .14); color: #ff99a4; }
  .txt { flex: 1; min-width: 0; }
  .what { font-size: 14px; line-height: 20px; color: var(--fds-text-primary); display: flex; gap: 8px; align-items: center; min-width: 0; }
  .where { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; padding: 1px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: var(--fds-control-fill-secondary, rgba(255,255,255,.08)); }
  .del { width: 32px; height: 32px; flex: none; border: 0; border-radius: 4px; background: none; color: var(--fds-text-secondary); display: grid; place-items: center; cursor: pointer; }
  .del:hover { background: var(--fds-subtle-fill-secondary); color: var(--fds-system-critical, #ff99a4); }
  .del:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }

  .form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  select, input {
    height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 4px; font: inherit; font-size: 13px; color: var(--fds-text-primary);
    background: var(--fds-control-fill-default, rgba(255,255,255,.06));
    box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -1px 0 var(--fds-control-strong-stroke-default, rgba(255,255,255,.4));
    outline: none;
  }
  select option { background: var(--fds-solid-background-base, #202020); color: var(--fds-text-primary); }
  input { flex: 1; min-width: 180px; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12.5px; }
  input:focus, select:focus { box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -2px 0 var(--fds-accent-default, #60cdff); }
  input::placeholder { color: var(--fds-text-secondary); font-family: inherit; }
  .hint, .warn { margin: 0; font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .hint :global(.fi) { display: inline-flex; vertical-align: -2px; }
  .warn { color: #fce100; }
</style>
