<script>
  import {
    Button,
    ToggleSwitch,
    Slider,
    SegmentedControl,
    SegmentedControlButton,
    ContentDialog,
    TextBlock
  } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';
  import SettingsCard from './SettingsCard.svelte';
  import Pet from './Pet.svelte';
  import RulesSection from './RulesSection.svelte';

  export let settings = {};
  export let themeInfo = { isDark: true, accent: null };
  export let projects = [];

  const api = (fn, ...a) => window.ccApi && window.ccApi[fn] && window.ccApi[fn](...a);
  const setSetting = (k, v) => api('setSetting', k, v);

  const ACCENT_PRESETS = [
    '#CA5010', '#D13438', '#E3008C', '#BF0077', '#881798', '#744DA9', '#0063B1', '#0078D7', '#00B7C3',
    '#00B294', '#018574', '#107C10', '#7A7574', '#767676', '#4C4A48', '#69797E', '#515C6B', '#2D7D9A',
  ];
  $: accentAuto = !settings.accentColor;
  $: accentNow = settings.accentColor || (themeInfo && themeInfo.accent ? `hsl(${themeInfo.accent.base})` : '#0078D7');

  let d = {
    shape: settings.shape || 'notch',
    radiusCompact: settings.radiusCompact ?? settings.radius ?? 100,
    radiusOverlay: settings.radiusOverlay ?? settings.radius ?? 100,
    radiusPeek: settings.radiusPeek ?? settings.radius ?? 100,
    radiusFull: settings.radiusFull ?? settings.radius ?? 100,
    notchHeight: settings.notchHeight || 34,
    notchWidth: settings.notchWidth || 104,
    notchLabel: settings.notchLabel || 150,
    focusMin: settings.focusMin || 25,
    breakMin: settings.breakMin || 5,
    longBreakMin: settings.longBreakMin || 15,
    stuckMin: settings.stuckMin ?? 5,
    lang: settings.langPref || settings.lang || 'auto',
    motion: settings.motion || 'on',
    sound: settings.sound || 'on',
    media: settings.media || 'spotify',
    display: settings.display || 'primary',
    accentMode: settings.accentColor ? 'manual' : 'auto',
  };
  let synced = { ...d };

  function pull(key, value) {
    if (value == null || value === synced[key]) return;
    synced[key] = value;
    d[key] = value;
  }
  $: pull('shape', settings.shape);
  $: pull('radiusCompact', settings.radiusCompact ?? settings.radius);
  $: pull('radiusOverlay', settings.radiusOverlay ?? settings.radius);
  $: pull('radiusPeek', settings.radiusPeek ?? settings.radius);
  $: pull('radiusFull', settings.radiusFull ?? settings.radius);
  $: pull('notchHeight', settings.notchHeight);
  $: pull('notchWidth', settings.notchWidth);
  $: pull('notchLabel', settings.notchLabel);
  $: pull('focusMin', settings.focusMin);
  $: pull('breakMin', settings.breakMin);
  $: pull('longBreakMin', settings.longBreakMin);
  $: pull('stuckMin', settings.stuckMin ?? 5);
  $: pull('lang', settings.langPref || settings.lang);
  $: pull('motion', settings.motion);
  $: pull('sound', settings.sound);
  $: pull('media', settings.media);
  $: pull('display', settings.display);
  $: pull('gameMode', settings.gameMode || 'hide');
  $: pull('accentMode', settings.accentColor ? 'manual' : 'auto');

  function push(key, value, settingKey = key) {
    if (value === synced[key]) return;
    synced[key] = value;
    setSetting(settingKey, value);
  }
  $: push('lang', d.lang);
  $: push('motion', d.motion);
  $: push('sound', d.sound);
  $: push('media', d.media);
  $: push('display', d.display);
  $: push('gameMode', d.gameMode);
  $: if (d.accentMode !== synced.accentMode) {
    synced.accentMode = d.accentMode;
    setSetting('accentColor', d.accentMode === 'auto' ? '' : (settings.accentColor || '#0078D7'));
  }

  const commit = (key) => (e) => { d[key] = e.detail; push(key, e.detail); };
  function pickShape(mode) { d.shape = mode; push('shape', mode); }

  let pv = 'compact';
  const PV_H = { compact: null, overlay: 66, peek: 132 };
  const rsOf = (k) => Math.min(150, Math.max(0, d[k] ?? 100)) / 100;
  $: pvH = pv === 'compact' ? d.notchHeight : PV_H[pv];
  $: pvR = Math.round(Math.min(pvH / 2, 34 * rsOf({ compact: 'radiusCompact', overlay: 'radiusOverlay', peek: 'radiusPeek' }[pv])));
  $: pvRadius = d.shape === 'pill' ? `${pvR}px` : `0 0 ${pvR}px ${pvR}px`;
  const commitIn = (key, view) => { const c = commit(key); return (e) => { pv = view; c(e); }; };
  const NOTCH = [['notchHeight', 'Yükseklik', 28, 44], ['notchWidth', 'Boştaki genişlik', 80, 240], ['notchLabel', 'Yazı alanı', 60, 280]];
  function resetNotch() {
    pv = 'compact';
    for (const [k, v] of [['notchHeight', 34], ['notchWidth', 104], ['notchLabel', 150]]) { d[k] = v; push(k, v); }
  }

  let confirmClear = false, confirmQuit = false;
  let cityDraft = settings.weatherCity || '', citySeen = settings.weatherCity || '';
  $: if ((settings.weatherCity || '') !== citySeen) { citySeen = settings.weatherCity || ''; cityDraft = citySeen; }
  const saveCity = () => setSetting('weatherCity', cityDraft.trim());

  $: petOn = settings.pet !== 'off';
  const PET_DEMO = [['working-thinking', 'Düşünüyor'], ['working-typing', 'Kod yazıyor'], ['reading', 'Dosya okuyor'], ['working-building', 'Komut çalıştırıyor'],
    ['working-testing', 'Test koşuyor'], ['detective', 'Web’de arıyor'], ['notification', 'Onay bekliyor'], ['celebrating', 'Bitti']];

  const AGENT_ICON = { claude: 'bot', codex: 'terminal', gemini: 'sparkles', cursor: 'pencil' };
  const AGENT_NOTE = {
    claude: 'Canlı durum, izin onayları ve sorular',
    codex: 'Canlı durum ve izin onayları',
    gemini: 'Canlı durum; onaylar terminalde verilir',
    cursor: 'Canlı durum (araçlar bittikçe) ve son mesaj',
  };
  $: agents = settings.agents || [];
  function agentDesc(a) {
    if (a.error) return 'Ayar dosyası okunamadı: ' + a.error;
    if (!a.detected) return 'Bu bilgisayarda bulunamadı';
    return (a.installed ? 'Bağlı · ' : 'Bağlı değil · ') + AGENT_NOTE[a.id];
  }
</script>

<div class="page">
  <h1 class="title">
    <span class="crumb">CC Island</span>
    <Icon name="chevronRight" size={16} className="crumb-sep" />
    <span>Ayarlar</span>
  </h1>

  <div class="preview">
    <div class="screen" class:pill={d.shape === 'pill'} aria-label="Ada önizlemesi">
      <div class="edge"></div>
      <div class="island v-{pv}" style="border-radius:{pvRadius};--nh:{d.notchHeight}px;--nw:{d.notchWidth}px;--nl:{d.notchLabel}px;--ac:{accentNow}">
        {#if pv === 'compact'}
          {#if petOn}<span class="pv-pet"><Pet name="working-typing" size={d.notchHeight - 4} /></span>{:else}<span class="spin"></span>{/if}
          <span class="lb">Dosyalar düzenleniyor…</span>
          <span class="count">2</span>
        {:else if pv === 'overlay'}
          {#if petOn}<span class="ico pet-ico"><Pet name="notification" size={40} /></span>{:else}<span class="ico"><Icon name="shield" size={16} /></span>{/if}
          <span class="ov-text"><b>Bash izni</b><small>npm run build</small></span>
          <span class="btn ghost">Reddet</span><span class="btn primary">İzin ver</span>
        {:else}
          <div class="pk-head">{#if petOn}<Pet name="reading" size={30} />{:else}<span class="spin"></span>{/if}<b>cc-island</b><small>2 dk</small></div>
          <div class="pk-row"><span class="tool"></span><span class="bar" style="width:72%"></span></div>
          <div class="pk-row"><span class="tool"></span><span class="bar" style="width:54%"></span></div>
          <div class="pk-row"><span class="tool"></span><span class="bar" style="width:64%"></span></div>
        {/if}
      </div>
    </div>
    <div class="pv-tabs" role="tablist" aria-label="Önizlenen görünüm">
      {#each [['compact', 'Kapsül'], ['overlay', 'Bildirim'], ['peek', 'Hover kartı']] as [v, label]}
        <button type="button" role="tab" class:sel={pv === v} aria-selected={pv === v} on:click={() => (pv = v)}>{label}</button>
      {/each}
    </div>
  </div>

  <section>
    <h2>Görünüm</h2>
    <div class="cards">
      <SettingsCard icon="paint" title="Ada şekli" desc="Ekranın üst kenarına yapışık çentik ya da üstte boşluk bırakan yüzen hap">
        <div slot="body" class="shape-options" role="radiogroup" aria-label="Ada şekli">
          {#each [['notch', 'Çentik'], ['pill', 'Yüzen hap']] as [mode, label]}
            <button type="button" class="shape-opt" class:sel={d.shape === mode} role="radio" aria-checked={d.shape === mode} on:click={() => pickShape(mode)}>
              <span class="mini" class:pill={mode === 'pill'}><span></span></span>
              <span class="opt-label">{label}</span>
            </button>
          {/each}
        </div>
      </SettingsCard>

      <SettingsCard icon="resize" title="Çentik boyutu" desc="Kapsülün yüksekliği, boştaki genişliği ve çalışırken açılan yazının uzunluğu">
        <Button on:click={resetNotch} disabled={d.notchHeight === 34 && d.notchWidth === 104 && d.notchLabel === 150}>Sıfırla</Button>
        <div slot="body" class="sizes">
          {#each NOTCH as [key, label, min, max]}
            <span class="sz-label">{label}</span>
            <div class="sz-slider"><Slider {min} {max} step={2} value={d[key]} suffix="px" on:change={commitIn(key, 'compact')} /></div>
            <span class="value">{d[key]} px</span>
          {/each}
        </div>
      </SettingsCard>

      <SettingsCard icon="layers" title="Kapsül köşeleri" desc="Kenara yapışık durum kapsülü · 0 keskin, 100 varsayılan, 150 en yuvarlak">
        <span class="value">%{d.radiusCompact}</span>
        <div class="slider"><Slider min={0} max={150} step={5} value={d.radiusCompact} suffix="%" on:change={commitIn('radiusCompact', 'compact')} /></div>
      </SettingsCard>

      <SettingsCard icon="bell" title="Bildirim kartı köşeleri" desc="İzin/alert kartları · şekil 'hap' seçiliyken kendini belli eder">
        <span class="value">%{d.radiusOverlay}</span>
        <div class="slider"><Slider min={0} max={150} step={5} value={d.radiusOverlay} suffix="%" on:change={commitIn('radiusOverlay', 'overlay')} /></div>
      </SettingsCard>

      <SettingsCard icon="eye" title="Hover önizleme köşeleri" desc="Üzerine gelince açılan kart">
        <span class="value">%{d.radiusPeek}</span>
        <div class="slider"><Slider min={0} max={150} step={5} value={d.radiusPeek} suffix="%" on:change={commitIn('radiusPeek', 'peek')} /></div>
      </SettingsCard>

      <SettingsCard icon="monitor" title="Tam panel köşeleri" desc="Genişletilmiş oturum paneli">
        <span class="value">%{d.radiusFull}</span>
        <div class="slider"><Slider min={0} max={150} step={5} value={d.radiusFull} suffix="%" on:change={commit('radiusFull')} /></div>
      </SettingsCard>

      <SettingsCard icon="color" title="Vurgu rengi" desc="Windows'un vurgu rengini kullan ya da elle seç">
        <SegmentedControl bind:value={d.accentMode}>
          <SegmentedControlButton value="auto">Otomatik</SegmentedControlButton>
          <SegmentedControlButton value="manual">El ile</SegmentedControlButton>
        </SegmentedControl>
        <div slot="body">
          <div class="sub-label">Windows renkleri</div>
          <div class="swatches" class:off={accentAuto} role="radiogroup" aria-label="Vurgu rengi">
            {#each ACCENT_PRESETS as hex}
              <button type="button" class="swatch" class:sel={!accentAuto && settings.accentColor === hex} style="background:{hex}"
                role="radio" aria-checked={!accentAuto && settings.accentColor === hex} aria-label={hex} title={hex}
                disabled={accentAuto} on:click={() => setSetting('accentColor', hex)}>
                {#if !accentAuto && settings.accentColor === hex}<span class="tick"><Icon name="check" size={12} /></span>{/if}
              </button>
            {/each}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard icon="bot" title="Animasyonlu maskot" desc="Kapsülde, bildirimlerde ve listede o an yapılan işe göre değişen piksel karakter">
        <span class="state">{petOn ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={petOn} on:change={(e) => setSetting('pet', e.target.checked ? 'on' : 'off')} />
        <div slot="body" class="pets" class:off={!petOn}>
          {#each PET_DEMO as [name, label]}
            <div class="pet-tile"><span class="pet-stage"><Pet {name} size={64} /></span><span class="pet-label">{label}</span></div>
          {/each}
        </div>
      </SettingsCard>

      <SettingsCard icon="sparkles" title="Animasyonlar" desc="Açılış, kapanış ve geçiş efektleri">
        <SegmentedControl bind:value={d.motion}>
          <SegmentedControlButton value="on">Açık</SegmentedControlButton>
          <SegmentedControlButton value="system">Sistem</SegmentedControlButton>
          <SegmentedControlButton value="off">Kapalı</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>

      <SettingsCard icon="globe" title="Dil" desc="Ada ve bildirimlerin dili">
        <SegmentedControl bind:value={d.lang}>
          <SegmentedControlButton value="auto">Otomatik</SegmentedControlButton>
          <SegmentedControlButton value="tr">Türkçe</SegmentedControlButton>
          <SegmentedControlButton value="en">English</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>

      <SettingsCard icon="monitor" title="Ekran" desc="Adanın gösterileceği monitör">
        <SegmentedControl bind:value={d.display}>
          <SegmentedControlButton value="primary">Ana monitör</SegmentedControlButton>
          <SegmentedControlButton value="cursor">Fare nerede</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Bildirimler ve medya</h2>
    <div class="cards">
      <SettingsCard icon="bell" title="Sesler" desc="İzin istekleri, sorular ve tamamlanan görevler için kısa tonlar">
        <SegmentedControl bind:value={d.sound}>
          <SegmentedControlButton value="on">Tümü</SegmentedControlButton>
          <SegmentedControlButton value="important">Yalnızca önemli</SegmentedControlButton>
          <SegmentedControlButton value="off">Kapalı</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>

      <SettingsCard icon="speaker" title="Sistem göstergeleri" desc="Ses, parlaklık ve pil değişince adada kısa bir gösterge">
        <span class="state">{settings.osd !== 'off' ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={settings.osd !== 'off'} on:change={(e) => setSetting('osd', e.target.checked ? 'on' : 'off')} />
      </SettingsCard>

      <SettingsCard icon="music" title="Müzik kartı" desc="Sol bölmedeki oynatıcının izlediği uygulama">
        <SegmentedControl bind:value={d.media}>
          <SegmentedControlButton value="spotify">Spotify</SegmentedControlButton>
          <SegmentedControlButton value="all">Tüm oynatıcılar</SegmentedControlButton>
          <SegmentedControlButton value="off">Kapalı</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Saat ve hava durumu</h2>
    <div class="cards">
      <SettingsCard icon="clock" title="Kapsülde saat" desc="Ajan boştayken kapsülde saat ve hava durumu görünür">
        <span class="state">{settings.clock !== 'off' ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={settings.clock !== 'off'} on:change={(e) => setSetting('clock', e.target.checked ? 'on' : 'off')} />
      </SettingsCard>
      <SettingsCard icon="wxPartly" title="Hava durumu şehri"
        desc={settings.weatherLoc ? settings.weatherLoc.name + (settings.weatherLoc.country ? ', ' + settings.weatherLoc.country : '') + ' · Open-Meteo, 30 dakikada bir' : 'Boş bırakılırsa hava durumu kapalı kalır ve hiçbir istek yapılmaz.'}>
        <input class="city" bind:value={cityDraft} placeholder="ör. İstanbul" aria-label="Şehir" on:keydown={(e) => e.key === 'Enter' && saveCity()} />
        <Button on:click={saveCity}>{cityDraft.trim() ? 'Kaydet' : 'Kapat'}</Button>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Oyun ve tam ekran</h2>
    <div class="cards">
      <SettingsCard icon="monitor" title="Tam ekran uygulamalarda"
        desc="Adanın ekranında oyun, tam ekran video ya da sunum açıkken. Özel tam ekran oyunlarda ada her zaman çekilir, oyun simge durumuna küçülmesin diye.">
        <SegmentedControl bind:value={d.gameMode}>
          <SegmentedControlButton value="hide">Gizle</SegmentedControlButton>
          <SegmentedControlButton value="important">Yalnızca onaylar</SegmentedControlButton>
          <SegmentedControlButton value="off">Göster</SegmentedControlButton>
        </SegmentedControl>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Odak zamanlayıcısı</h2>
    <div class="cards">
      {#each [['focusMin', 'timer', 'Odak süresi', 'Her odak bloğunun uzunluğu', 5, 180, 5], ['breakMin', 'clock', 'Kısa mola', 'Odak bitince başlayan mola', 1, 60, 1], ['longBreakMin', 'clock', 'Uzun mola', 'Her dördüncü odaktan sonra', 5, 60, 5]] as [key, icon, title, desc, min, max, step]}
        <SettingsCard {icon} {title} {desc}>
          <span class="value">{d[key]} dk</span>
          <div class="slider"><Slider {min} {max} {step} value={d[key]} suffix=" dk" on:change={commit(key)} /></div>
        </SettingsCard>
      {/each}

      <SettingsCard icon="bell" title="Windows odak oturumuyla eşleştir"
        desc="Odak başlayınca Windows'un odak modu da açılır ve bildirimler susar. Windows'tan (bildirim merkezi ya da Saat) başlatılan odak da adada görünür.">
        <span class="state">{settings.focusSync !== 'off' ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={settings.focusSync !== 'off'} on:change={(e) => setSetting('focusSync', e.target.checked ? 'on' : 'off')} />
      </SettingsCard>

      <SettingsCard icon="play" title="Molayı otomatik başlat" desc="Odak süresi dolunca mola kendiliğinden başlasın">
        <span class="state">{settings.autoBreak !== false ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={settings.autoBreak !== false} on:change={(e) => setSetting('autoBreak', e.target.checked)} />
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Takvim</h2>
    <div class="cards">
      <SettingsCard icon="calendar" title="Windows Takvim"
        desc="Windows'a eklenmiş hesapların (Outlook, Microsoft 365, Google, iCloud) etkinlikleri. Beş dakikada bir yenilenir.">
        <span class="state">{settings.calSystem !== 'off' ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={settings.calSystem !== 'off'} on:change={(e) => setSetting('calSystem', e.target.checked ? 'on' : 'off')} />
        <div slot="body" class="cal-body">
          <span>Takvimin boş mu görünüyor? Hesabını Windows'a ekle; yeni Outlook kendi takvimini Windows ile paylaşmıyor, o durumda iCal linkini kullan.</span>
          <Button on:click={() => api('app', 'win-accounts')}>Hesap ekle</Button>
        </div>
      </SettingsCard>

      <SettingsCard icon="globe" title="iCal linki"
        desc={settings.icalOn ? 'Bağlı. Windows takvimiyle birlikte gösterilir.' : 'İsteğe bağlı: Google, Outlook ya da iCloud takviminin gizli iCal linkini kopyala, sonra buradan bağla.'}>
        {#if settings.icalOn}
          <Button on:click={() => api('calendar', 'disconnect')}>Bağlantıyı kaldır</Button>
        {:else}
          <Button on:click={() => api('calendar', 'paste')}>Panodaki linki kullan</Button>
        {/if}
      </SettingsCard>

      <SettingsCard icon="refresh" title="Şimdi yenile" desc="Takvim kaynaklarını hemen yeniden oku">
        <Button disabled={!settings.calendarOn} on:click={() => api('calendar', 'refresh')}>Yenile</Button>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Yapay zekâ araçları</h2>
    <div class="cards">
      {#each agents as a (a.id)}
        <SettingsCard icon={AGENT_ICON[a.id] || 'plug'} title={a.label} desc={agentDesc(a)}>
          {#if a.installed}
            <span class="conn"><Icon name="circleCheck" size={16} />Bağlı</span>
            <Button on:click={() => api('hooks', 'remove', a.id)}>Kaldır</Button>
          {:else}
            <Button variant={a.detected ? 'accent' : 'standard'} disabled={!!a.error} on:click={() => api('hooks', 'install', a.id)}>Bağla</Button>
          {/if}
        </SettingsCard>
      {/each}
      <div class="note">Bağlamak, aracın kendi ayar dosyasına CC Island kancasını ekler (önce yedek alınır: <code>.ccisland.bak</code>). Değişiklik yeni açılan oturumlarda geçerli olur.</div>
    </div>
  </section>

  <section>
    <h2>Takılma uyarısı</h2>
    <div class="cards">
      <SettingsCard icon="alert" title="Takılmış görünen oturumlar"
        desc={d.stuckMin ? 'Bir araç ' + d.stuckMin + ' dakikadan uzun sürerse ya da aynı adım üst üste 3 kez tekrarlanırsa bildirir' : 'Kapalı'}>
        <span class="value">{d.stuckMin ? d.stuckMin + ' dk' : 'Kapalı'}</span>
        <div class="slider"><Slider min={0} max={30} step={1} value={d.stuckMin} on:change={commit('stuckMin')} /></div>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Onay kuralları</h2>
    <div class="cards">
      <SettingsCard icon="shield" title="Otomatik onay ve engelleme"
        desc="Eşleşen izin istekleri ada açılmadan onaylanır ya da reddedilir. Tüm ajanlarda çalışır.">
        <span class="state">{(settings.rules || []).length} kural</span>
        <div slot="body"><RulesSection rules={settings.rules || []} {projects} /></div>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Sistem</h2>
    <div class="cards">
      <SettingsCard icon="power" title="Windows ile başlat" desc="Oturum açınca ada arka planda hazır olur">
        <span class="state">{settings.startAtLogin ? 'Açık' : 'Kapalı'}</span>
        <ToggleSwitch checked={!!settings.startAtLogin} on:change={(e) => api('setLogin', e.target.checked)} />
      </SettingsCard>

      <SettingsCard icon="sparkles" title="Tüm durumları göster" desc="Her bildirimi ve durumu bir kez sırayla oynatır">
        <Button on:click={() => api('app', 'demo')}>Oynat</Button>
      </SettingsCard>

      <SettingsCard icon="trash" title="Oturumları temizle" desc="Listedeki tüm oturumları kaldırır">
        <Button on:click={() => (confirmClear = true)}>Temizle</Button>
      </SettingsCard>

      <SettingsCard icon="x" title="CC Island'dan çık" desc="Yeni bir Claude Code oturumu adayı yeniden açar">
        <Button on:click={() => (confirmQuit = true)}>Çık</Button>
      </SettingsCard>
    </div>
  </section>

  <section>
    <h2>Hakkında</h2>
    <div class="cards">
      <SettingsCard icon="info" title="CC Island" desc="Sürüm {settings.version || '1.0.0'}">
        <div slot="body" class="about">
          <span class="k">Yerel sunucu</span><span class="v mono">127.0.0.1:{settings.port || 47321}</span>
          <span class="k">Ayar dosyası</span><span class="v mono" title={settings.settingsPath}>{settings.settingsPath || '-'}</span>
        </div>
      </SettingsCard>
    </div>
  </section>
</div>

<ContentDialog bind:open={confirmClear} title="Oturumlar temizlensin mi?" size="small">
  <TextBlock>Listedeki tüm oturumlar kaldırılır. Çalışan oturumlar bir sonraki olayda listeye geri gelir.</TextBlock>
  <svelte:fragment slot="footer">
    <Button variant="accent" on:click={() => { confirmClear = false; api('app', 'clear'); }}>Temizle</Button>
    <Button on:click={() => (confirmClear = false)}>Vazgeç</Button>
  </svelte:fragment>
</ContentDialog>

<ContentDialog bind:open={confirmQuit} title="CC Island kapatılsın mı?" size="small">
  <TextBlock>Ada kapanır. Yeni bir Claude Code oturumu başladığında kendiliğinden açılır.</TextBlock>
  <svelte:fragment slot="footer">
    <Button variant="accent" on:click={() => { confirmQuit = false; api('app', 'quit'); }}>Çık</Button>
    <Button on:click={() => (confirmQuit = false)}>Vazgeç</Button>
  </svelte:fragment>
</ContentDialog>

<style>
  .page { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 28px 36px 40px; box-sizing: border-box; }

  .title {
    display: flex; align-items: center; gap: 12px; margin: 0 0 24px;
    font-family: var(--fds-font-family-display, 'Segoe UI Variable Display', 'Segoe UI', sans-serif);
    font-size: 28px; line-height: 36px; font-weight: 600; color: var(--fds-text-primary);
  }
  .crumb { color: var(--fds-text-secondary); }
  .title :global(.crumb-sep) { color: var(--fds-text-secondary); }

  .preview {
    margin-bottom: 28px; border-radius: 8px; overflow: hidden;
    background: var(--fds-card-background-default); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08));
  }
  .screen {
    position: relative; height: 196px; display: flex; justify-content: center; align-items: flex-start; overflow: hidden;
    background:
      radial-gradient(120% 90% at 20% 110%, color-mix(in srgb, var(--fds-accent-default, #60cdff) 34%, transparent) 0%, transparent 60%),
      radial-gradient(90% 80% at 95% 0%, rgba(255,255,255,.07) 0%, transparent 55%),
      linear-gradient(170deg, #1d2730 0%, #0e1318 100%);
  }
  .screen.pill { padding-top: 10px; }
  .edge { position: absolute; inset: 0 0 auto; height: 1px; background: rgba(255,255,255,.10); }
  .island {
    position: relative; display: flex; align-items: center; box-sizing: border-box; background: #000; color: #f3f3f3;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    transition: border-radius 250ms cubic-bezier(.2,.8,.2,1);
  }
  .v-compact { height: var(--nh); min-width: var(--nw); gap: 9px; padding: 0 12px 0 8px; }
  .lb { width: var(--nl); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; font-weight: 600; }
  .count {
    min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; display: grid; place-items: center;
    background: rgba(255,255,255,.14); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .spin {
    flex: none; width: 14px; height: 14px; box-sizing: border-box; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--ac) 25%, transparent); border-top-color: var(--ac); animation: pv-spin 1s linear infinite;
  }
  @keyframes pv-spin { to { transform: rotate(360deg); } }

  .v-overlay { height: 66px; width: 380px; gap: 12px; padding: 0 14px; }
  .ico {
    width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none;
    background: color-mix(in srgb, var(--ac) 22%, transparent); color: var(--ac);
  }
  .ov-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13px; line-height: 17px; }
  .ov-text small { color: #9a9a9a; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; }
  .btn { height: 28px; padding: 0 12px; border-radius: 14px; display: grid; place-items: center; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .btn.ghost { background: rgba(255,255,255,.1); }
  .btn.primary { background: var(--ac); color: #000; }

  .v-peek { height: 132px; width: 380px; flex-direction: column; align-items: stretch; justify-content: center; gap: 10px; padding: 0 18px; }
  .pk-head { display: flex; align-items: center; gap: 9px; font-size: 13px; }
  .pk-head small { margin-left: auto; color: #9a9a9a; font-size: 11.5px; }
  .pk-row { display: flex; align-items: center; gap: 9px; }
  .tool { width: 14px; height: 14px; border-radius: 4px; background: rgba(255,255,255,.16); flex: none; }
  .bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,.1); }

  .pv-tabs { display: flex; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }
  .pv-tabs button {
    position: relative; height: 32px; padding: 0 12px; border: 0; border-radius: 4px; background: none; cursor: pointer;
    font: inherit; font-size: 14px; color: var(--fds-text-secondary);
  }
  .pv-tabs button:hover { background: var(--fds-subtle-fill-secondary); color: var(--fds-text-primary); }
  .pv-tabs button.sel { color: var(--fds-text-primary); font-weight: 600; }
  .pv-tabs button.sel::after {
    content: ''; position: absolute; left: 50%; bottom: 2px; width: 16px; height: 3px; margin-left: -8px; border-radius: 2px;
    background: var(--fds-accent-default);
  }
  .pv-tabs button:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }

  .pv-pet { display: block; margin: -2px 0; }
  .ico.pet-ico { background: #161618; overflow: hidden; }

  .pets { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .pets.off { opacity: .4; }
  .pet-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px 8px; border-radius: 4px;
    background: var(--fds-card-background-secondary, rgba(255,255,255,.03)); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.06)); }
  .pet-stage { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 4px; background: #0e1116; overflow: hidden; }
  .pet-label { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); text-align: center; }

  .city { height: 32px; width: 180px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 4px; font: inherit; font-size: 13px; color: var(--fds-text-primary);
    background: var(--fds-control-fill-default, rgba(255,255,255,.06)); box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -1px 0 var(--fds-control-strong-stroke-default, rgba(255,255,255,.4)); outline: none; }
  .city:focus { box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -2px 0 var(--fds-accent-default, #60cdff); }
  .cal-body { display: flex; align-items: center; gap: 16px; justify-content: space-between; font-size: 13px; line-height: 18px; color: var(--fds-text-secondary); }
  .conn { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--fds-system-success, #6ccb5f); }
  .note { padding: 8px 4px 0; font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .note code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 11.5px; }

  .sizes { display: grid; grid-template-columns: 140px minmax(160px, 320px) 56px; align-items: center; gap: 8px 16px; }
  .sz-label { font-size: 14px; color: var(--fds-text-primary); }
  .sz-slider { min-width: 0; }

  section + section { margin-top: 28px; }
  h2 { margin: 0 0 8px 2px; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--fds-text-primary); }
  .cards { display: flex; flex-direction: column; gap: 4px; }

  .value { min-width: 48px; text-align: right; font-size: 14px; color: var(--fds-text-secondary); font-variant-numeric: tabular-nums; }
  .slider { width: 200px; }
  .state { font-size: 14px; color: var(--fds-text-primary); min-width: 44px; text-align: right; }

  .shape-options { display: flex; gap: 12px; }
  .shape-opt {
    width: 148px; padding: 0; border: 0; background: none; cursor: pointer; color: var(--fds-text-primary);
    display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit;
  }
  .mini {
    height: 84px; border-radius: 4px; display: flex; justify-content: center;
    background: linear-gradient(160deg, #24313c 0%, #121a21 100%);
    box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08));
    transition: box-shadow var(--fds-control-faster-duration, 83ms) linear;
  }
  .mini span { width: 56px; height: 14px; background: #000; border-radius: 0 0 7px 7px; }
  .mini.pill { padding-top: 7px; box-sizing: border-box; }
  .mini.pill span { border-radius: 7px; }
  .shape-opt:hover .mini { box-shadow: inset 0 0 0 1px var(--fds-control-strong-stroke-default, rgba(255,255,255,.5)); }
  .shape-opt.sel .mini { box-shadow: inset 0 0 0 2px var(--fds-accent-default, #60cdff); }
  .opt-label { font-size: 12px; line-height: 16px; }
  .shape-opt:focus-visible { outline: none; }
  .shape-opt:focus-visible .mini { box-shadow: var(--fds-focus-stroke); }

  .sub-label { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); margin-bottom: 8px; }
  .swatches { display: grid; grid-template-columns: repeat(9, 40px); gap: 4px; }
  .swatches.off { opacity: .4; }
  .swatch {
    position: relative; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
    transition: box-shadow var(--fds-control-faster-duration, 83ms) linear;
  }
  .swatch:hover:not(:disabled) { box-shadow: inset 0 0 0 2px rgba(255,255,255,.55); }
  .swatch.sel { box-shadow: inset 0 0 0 2px var(--fds-text-primary, #fff), inset 0 0 0 4px rgba(0,0,0,.6); }
  .swatch:disabled { cursor: default; }
  .tick {
    position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 2px; display: grid; place-items: center;
    background: var(--fds-text-primary, #fff); color: #000;
  }

  .about { display: grid; grid-template-columns: auto 1fr; gap: 8px 24px; font-size: 14px; line-height: 20px; }
  .k { color: var(--fds-text-secondary); white-space: nowrap; }
  .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .mono { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 13px; }

  @media (prefers-reduced-motion: reduce) { .island, .mini, .swatch { transition: none; } }
</style>
