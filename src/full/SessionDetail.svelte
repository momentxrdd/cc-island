<script>
  import {
    TextBlock,
    Button,
    IconButton,
    InfoBadge,
    InfoBar,
    ProgressBar,
    ProgressRing,
    Expander,
    SegmentedControl,
    SegmentedControlButton
  } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';
  import Markdown from './Markdown.svelte';
  import Composer from './Composer.svelte';

  import { createEventDispatcher } from 'svelte';

  export let session;
  export let pending = [];
  export let details = {};
  export let conv = null;
  export let currentTab = 'act';
  export let focusReply = 0;
  $: sum = session && session.lastSummary;
  const durText = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return m ? m + ' dk ' + (s % 60) + ' sn' : s + ' sn'; };

  const dispatch = createEventDispatcher();
  $: dispatch('tabchange', currentTab);

  function decide(id, behavior, answers) {
    if (window.ccApi && window.ccApi.decide) {
      window.ccApi.decide(id, behavior, answers);
    }
  }

  let qSelections = {};
  function picks(p) {
    if (!qSelections[p.id]) qSelections[p.id] = p.questions.map(() => []);
    return qSelections[p.id];
  }
  function needsSubmit(qs) {
    return qs.length > 1 || qs.some((q) => q.multiSelect);
  }
  function toggleOption(p, qi, label) {
    const sel = picks(p);
    const q = p.questions[qi];
    sel[qi] = q.multiSelect
      ? (sel[qi].includes(label) ? sel[qi].filter((l) => l !== label) : [...sel[qi], label])
      : [label];
    qSelections = qSelections;
    if (!needsSubmit(p.questions)) submitAnswers(p);
  }
  function submitAnswers(p) {
    const sel = picks(p);
    if (!sel.every((a) => a.length > 0)) return;
    const answers = {};
    p.questions.forEach((q, qi) => { answers[q.question] = sel[qi].join(', '); });
    delete qSelections[p.id];
    qSelections = qSelections;
    decide(p.id, 'answer', answers);
  }

  function dismissSession(id) {
    if (window.ccApi && window.ccApi.dismiss) {
      window.ccApi.dismiss(id);
    }
  }

  function copyText(text) {
    if (window.ccApi && window.ccApi.copy) {
      window.ccApi.copy(text);
    }
  }

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    if (m >= 60) return `${Math.floor(m / 60)} sa ${m % 60} dk`;
    if (m > 0) return `${m} dk ${s % 60} sn`;
    return `${s} sn`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return '0 sn';
    if (ms < 1000) return `${ms} ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${(ms / 1000).toFixed(1)} sn`;
    const m = Math.floor(s / 60);
    return `${m} dk ${s % 60} sn`;
  }

  function formatClock(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatNumber(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  function fetchDetailIfNeeded(sid, n) {
    const key = `${sid}:${n}`;
    if (!details[key] && window.ccApi && window.ccApi.getDetail) {
      window.ccApi.getDetail(sid, n).then(d => {
        details[key] = d || { input: null, output: '' };
        details = details;
      });
    }
  }

  $: minePending = pending.filter(p => p.session_id === session.id);
  $: otherPendingCount = pending.length - minePending.length;

  $: totalTodos = session.todos ? session.todos.length : 0;
  $: completedTodos = session.todos ? session.todos.filter(t => t.status === 'completed').length : 0;
  $: todoPercent = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  $: toolEntries = session.toolCounts ? Object.entries(session.toolCounts).sort((a, b) => b[1] - a[1]) : [];
  $: maxToolCount = toolEntries.length ? Math.max(...toolEntries.map(e => e[1])) : 1;
</script>

<div class="session-detail-root">
  <header class="detail-header">
    <div class="header-main">
      <div class="title-row">
        <TextBlock variant="subtitle" class="session-title">{session.name}</TextBlock>
        {#if session.status === 'working'}
          <InfoBadge severity="attention">Çalışıyor</InfoBadge>
        {:else if session.status === 'done'}
          <InfoBadge severity="success">Tamamlandı</InfoBadge>
        {:else if session.status === 'waiting'}
          <InfoBadge severity="attention">Onay Bekliyor</InfoBadge>
        {:else}
          <InfoBadge severity="neutral">Boşta</InfoBadge>
        {/if}
      </div>

      <div class="path-row" title={session.cwd}>
        <Icon name="folder" size={13} />
        <span class="path-text">{session.cwd}</span>
        <button class="fluent-link-btn" on:click={() => copyText(session.cwd)} title="Yolu Kopyala">
          <Icon name="copy" size={12} />
        </button>
      </div>
    </div>

    <div class="header-actions">
      <Button on:click={() => dismissSession(session.id)} title="Oturumu Kapat">
        <svelte:fragment slot="icon">
          <Icon name="trash" size={14} />
        </svelte:fragment>
        Kapat
      </Button>
    </div>
  </header>

  {#if otherPendingCount > 0}
    <div class="other-pending-alert">
      <InfoBar severity="attention" closable={false}>
        <svelte:fragment slot="icon">
          <Icon name="lock" size={16} />
        </svelte:fragment>
        Başka bir oturumda {otherPendingCount} adet onay bekleyen izin var.
      </InfoBar>
    </div>
  {/if}

  {#if minePending.length > 0}
    <div class="pending-section">
      {#each minePending as p (p.id)}
        <div class="pending-card">
          <div class="pending-head">
            <div class="pending-title">
              <Icon name="shield" size={16} className="pending-shield" />
              <TextBlock variant="bodyStrong">İzin Talebi: {p.tool}</TextBlock>
            </div>
            <TextBlock variant="caption" class="pending-time">{formatTimeAgo(p.ts)}</TextBlock>
          </div>

          {#if !p.questions && p.summary}
            <div class="pending-summary">
              <code>{p.summary}</code>
            </div>
          {/if}

          {#if !p.questions && p.detail}
            <pre class="pending-detail">{p.detail}</pre>
          {/if}

          {#if p.questions && p.questions.length > 0}
            {@const sel = qSelections[p.id] || []}
            {@const allAnswered = sel.length === p.questions.length && sel.every((a) => a && a.length > 0)}
            <div class="questions-box">
              {#each p.questions as q, qi}
                {@const selArr = sel[qi] || []}
                <div class="q-block">
                  {#if q.header}<span class="q-header-chip">{q.header}</span>{/if}
                  <TextBlock variant="bodyStrong">{q.question}</TextBlock>
                  {#if q.multiSelect}<TextBlock variant="caption" class="q-hint">Birden fazla seçilebilir</TextBlock>{/if}
                  <div class="q-options">
                    {#each q.options as opt}
                      {@const picked = selArr.includes(opt.label)}
                      <button
                        type="button"
                        class="q-option-btn {picked ? 'selected' : ''}"
                        on:click={() => toggleOption(p, qi, opt.label)}
                      >
                        <span class="q-opt-check">{#if picked}<Icon name="check" size={11} />{/if}</span>
                        <span class="q-opt-text">
                          <b>{opt.label}</b>
                          {#if opt.description}<small>{opt.description}</small>{/if}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
              <div class="pending-buttons">
                {#if needsSubmit(p.questions)}
                  <Button variant="accent" disabled={!allAnswered} on:click={() => submitAnswers(p)}>
                    <svelte:fragment slot="icon"><Icon name="check" size={14} /></svelte:fragment>
                    Gönder
                  </Button>
                {/if}
                <Button on:click={() => decide(p.id, 'terminal')} title="Terminalde Cevapla">
                  <svelte:fragment slot="icon"><Icon name="terminal" size={14} /></svelte:fragment>
                  {needsSubmit(p.questions) ? 'Terminal' : 'Terminalde Cevapla'}
                </Button>
              </div>
            </div>
          {:else}
            <div class="pending-buttons">
              <Button variant="accent" on:click={() => decide(p.id, 'allow')}>
                <svelte:fragment slot="icon"><Icon name="check" size={14} /></svelte:fragment>
                İzin Ver
              </Button>
              <Button on:click={() => decide(p.id, 'deny')}>
                <svelte:fragment slot="icon"><Icon name="x" size={14} /></svelte:fragment>
                Reddet
              </Button>
              {#if p.hasSug}
                <Button on:click={() => decide(p.id, 'always')}>
                  <svelte:fragment slot="icon"><Icon name="shield" size={14} /></svelte:fragment>
                  Her Zaman İzin Ver
                </Button>
              {/if}
              <Button on:click={() => decide(p.id, 'terminal')} title="Terminalde Cevapla">
                <svelte:fragment slot="icon"><Icon name="terminal" size={14} /></svelte:fragment>
                Terminal
              </Button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if session.todos && session.todos.length > 0}
    <div class="todos-section">
      <div class="todos-header">
        <div class="todos-title">
          <Icon name="todo" size={14} />
          <TextBlock variant="bodyStrong">Görevler ({completedTodos}/{totalTodos})</TextBlock>
        </div>
        <div class="todos-progress-wrap">
          <ProgressBar value={todoPercent} />
        </div>
      </div>

      <div class="todos-list">
        {#each session.todos as t}
          <div class="todo-row {t.status}">
            <div class="todo-check">
              {#if t.status === 'completed'}
                <Icon name="check" size={12} className="todo-check-icon" />
              {:else if t.status === 'in_progress'}
                <span class="todo-dot in_progress"></span>
              {:else}
                <span class="todo-dot pending"></span>
              {/if}
            </div>
            <span class="todo-text">
              {t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="detail-tabs">
    <SegmentedControl bind:value={currentTab}>
      <SegmentedControlButton value="act">
        <Icon name="activity" size={14} />
        <span>Aktivite</span>
        {#if session.activity && session.activity.length > 0}
          <span class="tab-badge">{session.activity.length}</span>
        {/if}
      </SegmentedControlButton>
      <SegmentedControlButton value="chat">
        <Icon name="message" size={14} />
        <span>Konuşma</span>
      </SegmentedControlButton>
      <SegmentedControlButton value="info">
        <Icon name="info" size={14} />
        <span>Bilgi & İstatistik</span>
      </SegmentedControlButton>
    </SegmentedControl>
  </div>

  <div class="tab-content">
    {#if currentTab === 'act'}
      <div class="act-tab">
        {#if session.current}
          <div class="current-task-card">
            <div class="current-task-icon">
              <ProgressRing size={20} />
            </div>
            <div class="current-task-info">
              <div class="current-task-top">
                <span class="current-tool-badge">{session.current.tool}</span>
                <span class="current-task-time">{formatTimeAgo(session.current.ts)}</span>
              </div>
              <div class="current-task-summary">
                <code>{session.current.summary}</code>
              </div>
            </div>
          </div>
        {/if}

        {#if session.lastText}
          <div class="latest-say-card">
            <div class="say-header">
              <Icon name="sparkles" size={13} className="sparkle-icon" />
              <TextBlock variant="caption" class="say-title">Son Yanıt / Düşünce</TextBlock>
            </div>
            {#if sum && session.status === 'done'}
              <div class="sum-row">
                <span><Icon name="clock" size={12} />{durText(sum.end - sum.start)}</span>
                <span><Icon name="wrench" size={12} />{sum.tools} araç</span>
                {#if sum.files.length}<span title={sum.files.join('\n')}><Icon name="pencil" size={12} />{sum.files.length} dosya değişti</span>{/if}
                {#if sum.errors}<span class="bad"><Icon name="alert" size={12} />{sum.errors} hata</span>{/if}
              </div>
            {/if}
            <Markdown className="say-body" text={session.lastText} />
          </div>
        {/if}

        <div class="activity-feed">
          <TextBlock variant="bodyStrong" class="feed-title">
            <Icon name="activity" size={14} />
            İşlem Geçmişi
          </TextBlock>

          {#if !session.activity || session.activity.length === 0}
            <div class="empty-feed">
              <TextBlock variant="caption">Henüz bir aktivite kaydı yok.</TextBlock>
            </div>
          {:else}
            {#each [...session.activity].reverse() as a (a.n)}
              {@const key = `${session.id}:${a.n}`}
              {@const d = details[key]}
              <div class="feed-item">
                <Expander on:expand={() => fetchDetailIfNeeded(session.id, a.n)}>
                  <div slot="icon" class="expander-icon-slot">
                    {#if a.tool === 'Prompt'}
                      <Icon name="user" size={14} />
                    {:else if a.error}
                      <span class="status-icon-badge error"><Icon name="alert" size={12} /></span>
                    {:else if a.done}
                      <span class="status-icon-badge success"><Icon name="check" size={12} /></span>
                    {:else}
                      <ProgressRing size={14} />
                    {/if}
                  </div>

                  <div class="expander-header-row">
                    <span class="ev-tool">{a.tool}</span>
                    <span class="ev-summary" title={a.summary}>{a.summary}</span>
                    <span class="ev-time">
                      {#if a.done && a.endedAt}
                        {formatDuration(a.endedAt - a.ts)}
                      {:else}
                        {formatClock(a.ts)}
                      {/if}
                    </span>
                  </div>

                  <svelte:fragment slot="content">
                    {#if !d}
                      <div class="loading-detail">
                        <ProgressRing size={16} />
                        <span>Ayrıntılar yükleniyor...</span>
                      </div>
                    {:else}
                      {#if d.input}
                        <div class="code-block input-block">
                          <div class="block-label">Girdi</div>
                          <pre>{JSON.stringify(d.input, null, 2)}</pre>
                        </div>
                      {/if}
                      {#if d.output}
                        <div class="code-block output-block {a.error ? 'has-error' : ''}">
                          <div class="block-label">{a.error ? 'Hata Çıktısı' : 'Çıktı'}</div>
                          <pre>{d.output}</pre>
                        </div>
                      {/if}
                    {/if}
                  </svelte:fragment>
                </Expander>
              </div>
            {/each}
          {/if}
        </div>
      </div>

    {:else if currentTab === 'chat'}
      <div class="chat-tab">
        {#if !conv}
          <div class="loading-chat">
            <ProgressRing size={24} />
            <TextBlock variant="body">Konuşma geçmişi alınıyor...</TextBlock>
          </div>
        {:else if !conv.messages || conv.messages.length === 0}
          <div class="empty-chat">
            <Icon name="message" size={32} />
            <TextBlock variant="body">Henüz mesajlaşma geçmişi yok.</TextBlock>
          </div>
        {:else}
          <div class="messages-list">
            {#each conv.messages as m}
              <div class="message-bubble {m.role}">
                <div class="msg-avatar">
                  <Icon name={m.role === 'user' ? 'user' : 'sparkles'} size={14} />
                </div>
                <div class="msg-content">
                  <div class="msg-meta">
                    <span class="msg-sender">{m.role === 'user' ? 'Siz' : 'Claude'}</span>
                    <span class="msg-time">{formatClock(m.ts)}</span>
                  </div>

                  {#if m.text}
                    {#if m.role === 'user'}<div class="msg-text">{m.text}</div>{:else}<Markdown className="msg-md" text={m.text} />{/if}
                  {/if}

                  {#if m.tools && m.tools.length > 0}
                    <div class="msg-tools">
                      {#each m.tools as t}
                        <span class="tool-chip">
                          <Icon name="wrench" size={11} />
                          <b>{t.name}</b>
                          <code>{t.summary}</code>
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else if currentTab === 'info'}
      <div class="info-tab">
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-k"><Icon name="zap" size={12} /> Durum</div>
            <div class="metric-v">{session.status}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="clock" size={12} /> Oturum Süresi</div>
            <div class="metric-v">{formatTimeAgo(session.started)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="wrench" size={12} /> Bu Turdaki Araçlar</div>
            <div class="metric-v">{session.tools || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="hash" size={12} /> Toplam Araç Çağrısı</div>
            <div class="metric-v">{session.totalTools || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="message" size={12} /> İstek Sayısı (Turns)</div>
            <div class="metric-v">{session.turns || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="alert" size={12} /> Hata Sayısı</div>
            <div class="metric-v">{session.errors || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="layers" size={12} /> Giriş Tokenleri</div>
            <div class="metric-v">{conv && conv.usage ? formatNumber(conv.usage.input + (conv.usage.cacheRead || 0)) : '—'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-k"><Icon name="cpu" size={12} /> Çıkış Tokenleri</div>
            <div class="metric-v">{conv && conv.usage ? formatNumber(conv.usage.output) : '—'}</div>
          </div>
        </div>

        <div class="detail-kv-table">
          <div class="kv-row">
            <span class="kv-key">Model</span>
            <span class="kv-val">{conv && conv.model ? conv.model : '—'}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Oturum Kimliği</span>
            <span class="kv-val">{session.id}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Çalışma Dizini</span>
            <span class="kv-val">{session.cwd}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Başlangıç Zamanı</span>
            <span class="kv-val">{formatClock(session.started)}</span>
          </div>
        </div>

        {#if toolEntries.length > 0}
          <div class="tools-breakdown-section">
            <TextBlock variant="bodyStrong">
              <Icon name="wrench" size={14} />
              Araç Dağılımı
            </TextBlock>
            <div class="tool-bars">
              {#each toolEntries as [toolName, count]}
                <div class="tool-bar-row">
                  <span class="t-name">{toolName}</span>
                  <div class="t-progress">
                    <ProgressBar value={Math.round((count / maxToolCount) * 100)} />
                  </div>
                  <span class="t-count">{count}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if session.files && session.files.length > 0}
          <div class="touched-files-section">
            <TextBlock variant="bodyStrong">
              <Icon name="folder" size={14} />
              Dokunulan Dosyalar ({session.files.length})
            </TextBlock>
            <div class="files-list">
              {#each session.files as f}
                <div class="file-row">
                  <Icon name="fileText" size={13} />
                  <span class="file-path" title={f.path}>{f.path}</span>
                  <div class="file-badges">
                    {#if f.reads}
                      <span class="rw-badge r">R {f.reads}</span>
                    {/if}
                    {#if f.writes}
                      <span class="rw-badge w">W {f.writes}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if session.agent !== 'cursor'}<Composer {session} {pending} focusToken={focusReply} />{/if}
</div>

<style>
  .session-detail-root {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 20px;
    box-sizing: border-box;
    gap: 14px;
    background: var(--fds-solid-background-base, transparent);
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
    padding-bottom: 12px;
  }

  .header-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.session-title) {
    font-size: 20px !important;
    font-weight: 600 !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    opacity: 0.7;
  }
  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 480px;
  }

  .fluent-link-btn {
    background: transparent;
    border: none;
    color: currentColor;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    opacity: 0.8;
  }
  .fluent-link-btn:hover {
    background: var(--fds-subtle-fill-secondary, rgba(255, 255, 255, 0.1));
    opacity: 1;
  }

  .other-pending-alert {
    margin-bottom: 4px;
  }

  .pending-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pending-card {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--fds-accent-default, #0078d4);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }

  :global(.session-detail-root .expander),
  :global(.session-detail-root .expander-header) {
    border-radius: 10px !important;
  }
  :global(.session-detail-root .button) {
    border-radius: 8px !important;
    box-shadow: none !important;
  }
  :global(.session-detail-root .button:hover) {
    filter: none !important;
    transform: none !important;
  }

  .pending-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pending-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.pending-shield) {
    color: var(--fds-accent-default, #0078d4);
  }

  :global(.pending-time) {
    opacity: 0.6;
  }

  .pending-summary code {
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    word-break: break-all;
  }

  .pending-detail {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
    font-family: monospace;
    max-height: 160px;
    overflow-y: auto;
    overflow-x: hidden;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .pending-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .questions-box {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .q-header-chip {
    display: inline-block;
    font-size: 11px;
    font-weight: 650;
    padding: 1px 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--fds-accent-text-primary, #60cdff);
    margin-bottom: 4px;
  }
  :global(.q-hint) {
    opacity: 0.6;
    margin-top: 2px;
  }
  .q-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .q-option-btn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 11px;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: background .15s ease, border-color .15s ease;
  }
  .q-option-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .q-option-btn.selected {
    background: color-mix(in srgb, var(--fds-accent-default, #0078d4) 16%, transparent);
    border-color: var(--fds-accent-default, #0078d4);
  }
  .q-opt-check {
    width: 15px;
    height: 15px;
    margin-top: 1px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .q-option-btn.selected .q-opt-check {
    background: var(--fds-accent-default, #0078d4);
    border-color: var(--fds-accent-default, #0078d4);
    color: #fff;
  }
  .q-opt-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .q-opt-text b {
    font-size: 12.5px;
    font-weight: 600;
  }
  .q-opt-text small {
    font-size: 11.5px;
    opacity: 0.65;
    line-height: 1.4;
  }

  .todos-section {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
    border-radius: var(--fds-control-corner-radius, 8px);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .todos-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .todos-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .todos-progress-wrap {
    width: 140px;
  }

  .todos-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .todo-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .todo-row.completed {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .todo-check {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.todo-check-icon) {
    color: var(--fds-accent-default, #10b981);
  }

  .todo-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .todo-dot.in_progress { background: #60cdff; box-shadow: 0 0 6px #60cdff; }
  .todo-dot.pending { background: rgba(255, 255, 255, 0.3); }

  .detail-tabs {
    margin: 4px 0;
  }

  .tab-badge {
    background: var(--fds-accent-default, #0078d4);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: 6px;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
  }

  .act-tab {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .current-task-card {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--fds-accent-default, #0078d4);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .current-task-info {
    flex: 1;
    min-width: 0;
  }

  .current-task-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .current-tool-badge {
    background: var(--fds-accent-default, #0078d4);
    color: white;
    font-weight: 600;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .current-task-time {
    font-size: 11px;
    opacity: 0.6;
  }

  .current-task-summary code {
    font-size: 12px;
    word-break: break-all;
  }

  .latest-say-card {
    background: var(--fds-card-background-secondary, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.07));
    border-radius: 8px;
    padding: 12px;
  }
  .say-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  :global(.sparkle-icon) {
    color: var(--fds-accent-default, #f59e0b);
  }
  .sum-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 8px; }
  .sum-row span { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 12px;
    color: var(--fds-text-secondary); background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.06)); }
  .sum-row span.bad { color: var(--fds-system-critical, #ff99a4); }
  :global(.md.say-body), :global(.md.msg-md) {
    font-size: 13.5px;
    line-height: 20px;
  }

  .activity-feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global(.feed-title) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .feed-item {
    margin-bottom: 2px;
  }

  .expander-icon-slot {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-icon-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .status-icon-badge.success { color: #10b981; }
  .status-icon-badge.error { color: #ef4444; }

  .expander-header-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .ev-tool {
    font-weight: 600;
    font-size: 13px;
    width: 90px;
    flex-shrink: 0;
  }

  .ev-summary {
    flex: 1;
    font-family: monospace;
    font-size: 12px;
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ev-time {
    font-size: 11px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .loading-detail {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    opacity: 0.7;
    padding: 8px 0;
  }

  .code-block {
    margin-top: 8px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
  }
  .block-label {
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .code-block pre {
    margin: 0;
    padding: 10px;
    font-size: 12px;
    font-family: monospace;
    max-height: 200px;
    overflow-y: auto;
    overflow-x: hidden;
    background: rgba(0, 0, 0, 0.3);
    white-space: pre-wrap;
    word-break: break-all;
  }
  .code-block.has-error {
    border-color: #ef4444;
  }

  .chat-tab {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .loading-chat, .empty-chat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    opacity: 0.6;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .message-bubble {
    display: flex;
    gap: 12px;
    max-width: 90%;
  }
  .message-bubble.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .message-bubble.user .msg-content {
    background: var(--fds-accent-default, #0078d4);
    color: white;
  }

  .msg-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .msg-content {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .msg-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    opacity: 0.7;
  }
  .msg-sender {
    font-weight: 600;
  }

  .msg-text {
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .tool-chip {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .tool-chip code {
    opacity: 0.7;
  }

  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .metric-card {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    padding: 10px 12px;
  }
  .metric-k {
    font-size: 11px;
    opacity: 0.65;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .metric-v {
    font-size: 16px;
    font-weight: 600;
  }

  .detail-kv-table {
    background: var(--fds-card-background-default, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--fds-card-stroke-default, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    overflow: hidden;
  }
  .kv-row {
    display: flex;
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .kv-row:last-child {
    border-bottom: none;
  }
  .kv-key {
    width: 140px;
    opacity: 0.6;
    flex-shrink: 0;
  }
  .kv-val {
    flex: 1;
    font-family: monospace;
    word-break: break-all;
  }

  .tools-breakdown-section, .touched-files-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tool-bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tool-bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }
  .t-name {
    width: 100px;
    font-family: monospace;
    flex-shrink: 0;
  }
  .t-progress {
    flex: 1;
  }
  .t-count {
    width: 30px;
    text-align: right;
    font-weight: 600;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .file-path {
    flex: 1;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-badges {
    display: flex;
    gap: 4px;
  }
  .rw-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .rw-badge.r { background: rgba(59, 130, 246, 0.2); color: #60cdff; }
  .rw-badge.w { background: rgba(16, 185, 129, 0.2); color: #4ade80; }
</style>
