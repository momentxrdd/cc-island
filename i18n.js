/**
 * Minimal i18n for CC Island. Works in the Electron main process (CommonJS) and in the renderer (global `I18N`).
 *   I18N.t('ui.allow')                       -> "Allow"
 *   I18N.t('dur.ms', { m: 2, s: 5 })         -> "2m 5s"
 *   I18N.t('ui.sessions.many', { n: 3 })     -> "3 sessions"
 * Missing keys fall back to English, then to the key itself.
 */
const DICT = {
  en: {
    // status
    'status.working': 'Working',
    'status.waiting': 'Awaiting approval',
    'status.done': 'Done',
    'status.idle': 'Idle',

    // generic UI
    'ui.permission': 'Permission request',
    'ui.noDetails': '(no details)',
    'ui.noOutput': '(no output)',
    'ui.allow': 'Allow',
    'ui.deny': 'Deny',
    'ui.alwaysAllow': 'Always allow',
    'ui.always': 'Always',
    'ui.askTerminal': 'Ask in terminal',
    'ui.keyAllow': 'allow',
    'ui.keyDeny': 'deny',
    'ui.copy': 'Copy',
    'ui.copyPath': 'Copy folder path',
    'ui.remove': 'Remove from list',
    'ui.loading': 'Loading…',
    'ui.runningDots': 'Running…',
    'ui.clickDetails': 'Click for details',
    'ui.noSessions': 'No active Claude Code session',
    'ui.toolFailed': 'A tool failed',
    'ui.taskDone': 'Task completed',
    'ui.session': 'Session',
    'ui.idle': 'idle',
    'ui.aria.status': 'Claude Code status',
    'ui.aria.compact': 'Claude Code: {text}',
    'ui.aria.collapse': 'Collapse',

    // counts (one / many)
    'ui.sessions.one': '1 session',
    'ui.sessions.many': '{n} sessions',
    'ui.running.one': '1 running',
    'ui.running.many': '{n} running',
    'ui.pending.one': '1 approval waiting',
    'ui.pending.many': '{n} approvals waiting',
    'ui.otherApprovals.one': '1 approval is waiting in another session',
    'ui.otherApprovals.many': '{n} approvals are waiting in other sessions',
    'ui.toolCalls.one': '1 tool call',
    'ui.toolCalls.many': '{n} tool calls',

    // notifications
    'notif.permission': '{name} wants approval',
    'notif.waiting': '{name} is waiting for you',
    'notif.done': '{name} completed',
    'notif.error': '{name}: error',

    // time
    'dur.hm': '{h}h {m}m',
    'dur.ms': '{m}m {s}s',
    'dur.s': '{s}s',
    'dur.msShort': '{ms}ms',
    'dur.ago': '{t} ago',

    // sections / tabs
    'tab.activity': 'Activity',
    'tab.chat': 'Conversation',
    'tab.info': 'Overview',
    'sec.latest': "Claude's last message",
    'sec.activity': 'Activity feed',
    'sec.toolBreakdown': 'Tool breakdown',
    'sec.touched': 'Touched files',
    'sec.tasks': 'Tasks',
    'ui.noActivity': 'No activity yet',
    'ui.loadingConv': 'Loading conversation…',
    'ui.noConv': 'No conversation record found',
    'ui.you': 'You',

    // activity blocks
    'block.command': 'Command',
    'block.description': 'Description',
    'block.timeout': 'Timeout',
    'block.file': 'File',
    'block.change': 'Change',
    'block.edit': 'Edit {n}',
    'block.content': 'Content',
    'block.request': 'Request',
    'block.instructions': 'Instructions',
    'block.type': 'Type',
    'block.output': 'Output',
    'block.outputError': 'Output (error)',

    // overview tiles
    'tile.status': 'Status',
    'tile.lastDuration': 'Last request duration',
    'tile.toolsTurn': 'Tools this turn',
    'tile.toolsTotal': 'Total tools',
    'tile.requests': 'Requests',
    'tile.errors': 'Errors',
    'tile.inputTokens': 'Input tokens',
    'tile.outputTokens': 'Output tokens',
    'tile.cache': 'cache',
    'kv.model': 'Model',
    'kv.session': 'Session',
    'kv.folder': 'Folder',
    'kv.transcript': 'Transcript',
    'kv.started': 'Started',

    // full panel footer

    // demo
    'demo.newTitle': 'New notification',
    'demo.newText': 'Claude Code wants to tell you something',
    'demo.scanning': 'Scanning files',
    'demo.reviewing': 'Reviewing 128 files…',
    'demo.almost': 'Almost done',
    'demo.progress': '{i} / 128 files',
    'demo.done': 'Done',
    'demo.testsPassed': 'All tests passed (24/24)',
    'demo.errorTitle': 'Error occurred',
    'demo.errorText': 'npm test failed (exit code 1)',

    // Spotify
    'music.prev': 'Previous',
    'music.next': 'Next',
    'music.play': 'Play',
    'music.pause': 'Pause',
    'music.progress': 'Track progress',

    // tray / settings
    'tray.language': 'Language',
    'tray.langAuto': 'Automatic (system)',
    'tray.animations': 'Animations',
    'tray.animOn': 'Always on',
    'tray.animSystem': 'Follow Windows setting',
    'tray.animOff': 'Off',
    'tray.demo': 'Demo: show all states',
    'tray.clear': 'Clear all sessions',
    'tray.quit': 'Quit',

    // main process messages
    'main.denied': 'Denied from CC Island',
    'main.waitingPermission': '{tool} permission pending',
    'main.waitingInput': 'Waiting for input',
    'main.tasks.one': '1 task',
    'main.tasks.many': '{n} tasks',
    'main.edits.one': '1 edit',
    'main.edits.many': '{n} edits',
  },

  tr: {
    'status.working': 'Çalışıyor',
    'status.waiting': 'Onay bekliyor',
    'status.done': 'Tamamlandı',
    'status.idle': 'Boşta',

    'ui.permission': 'İzin isteği',
    'ui.noDetails': '(ayrıntı yok)',
    'ui.noOutput': '(çıktı yok)',
    'ui.allow': 'Onayla',
    'ui.deny': 'Reddet',
    'ui.alwaysAllow': 'Her zaman izin ver',
    'ui.always': 'Her zaman',
    'ui.askTerminal': 'Terminalde sor',
    'ui.keyAllow': 'onayla',
    'ui.keyDeny': 'reddet',
    'ui.copy': 'Kopyala',
    'ui.copyPath': 'Klasör yolunu kopyala',
    'ui.remove': 'Listeden kaldır',
    'ui.loading': 'Yükleniyor…',
    'ui.runningDots': 'Çalışıyor…',
    'ui.clickDetails': 'Ayrıntı için tıkla',
    'ui.noSessions': 'Aktif Claude Code oturumu yok',
    'ui.toolFailed': 'Bir araç hata verdi',
    'ui.taskDone': 'Görev tamamlandı',
    'ui.session': 'Oturum',
    'ui.idle': 'boşta',
    'ui.aria.status': 'Claude Code durumu',
    'ui.aria.compact': 'Claude Code: {text}',
    'ui.aria.collapse': 'Küçült',

    'ui.sessions.one': '1 oturum',
    'ui.sessions.many': '{n} oturum',
    'ui.running.one': '1 çalışıyor',
    'ui.running.many': '{n} çalışıyor',
    'ui.pending.one': '1 onay bekliyor',
    'ui.pending.many': '{n} onay bekliyor',
    'ui.otherApprovals.one': 'Başka bir oturumda 1 onay bekliyor',
    'ui.otherApprovals.many': 'Başka oturumlarda {n} onay bekliyor',
    'ui.toolCalls.one': '1 araç çağrısı',
    'ui.toolCalls.many': '{n} araç çağrısı',

    'notif.permission': '{name} onay istiyor',
    'notif.waiting': '{name} seni bekliyor',
    'notif.done': '{name} tamamlandı',
    'notif.error': '{name}: hata',

    'dur.hm': '{h}sa {m}dk',
    'dur.ms': '{m}dk {s}sn',
    'dur.s': '{s}sn',
    'dur.msShort': '{ms}ms',
    'dur.ago': '{t} önce',

    'tab.activity': 'Etkinlik',
    'tab.chat': 'Konuşma',
    'tab.info': 'Genel',
    'sec.latest': "Claude'un son mesajı",
    'sec.activity': 'Etkinlik akışı',
    'sec.toolBreakdown': 'Araç dağılımı',
    'sec.touched': 'Dokunulan dosyalar',
    'sec.tasks': 'Görevler',
    'ui.noActivity': 'Henüz etkinlik yok',
    'ui.loadingConv': 'Konuşma yükleniyor…',
    'ui.noConv': 'Konuşma kaydı bulunamadı',
    'ui.you': 'Sen',

    'block.command': 'Komut',
    'block.description': 'Açıklama',
    'block.timeout': 'Zaman aşımı',
    'block.file': 'Dosya',
    'block.change': 'Değişiklik',
    'block.edit': 'Düzenleme {n}',
    'block.content': 'İçerik',
    'block.request': 'İstek',
    'block.instructions': 'Talimat',
    'block.type': 'Tür',
    'block.output': 'Çıktı',
    'block.outputError': 'Çıktı (hata)',

    'tile.status': 'Durum',
    'tile.lastDuration': 'Son istek süresi',
    'tile.toolsTurn': 'Bu turda araç',
    'tile.toolsTotal': 'Toplam araç',
    'tile.requests': 'İstek sayısı',
    'tile.errors': 'Hata',
    'tile.inputTokens': 'Girdi token',
    'tile.outputTokens': 'Çıktı token',
    'tile.cache': 'önbellek',
    'kv.model': 'Model',
    'kv.session': 'Oturum',
    'kv.folder': 'Klasör',
    'kv.transcript': 'Kayıt',
    'kv.started': 'Başlangıç',


    'demo.newTitle': 'Yeni bildirim',
    'demo.newText': 'Claude Code sana bir şey söylemek istiyor',
    'demo.scanning': 'Dosyalar taranıyor',
    'demo.reviewing': '128 dosya inceleniyor…',
    'demo.almost': 'Neredeyse bitti',
    'demo.progress': '{i} / 128 dosya',
    'demo.done': 'Tamamlandı',
    'demo.testsPassed': 'Tüm testler geçti (24/24)',
    'demo.errorTitle': 'Hata oluştu',
    'demo.errorText': 'npm test başarısız oldu (exit code 1)',

    'music.prev': 'Önceki',
    'music.next': 'Sonraki',
    'music.play': 'Oynat',
    'music.pause': 'Duraklat',
    'music.progress': 'Şarkı ilerlemesi',

    'tray.language': 'Dil',
    'tray.langAuto': 'Otomatik (sistem)',
    'tray.animations': 'Animasyonlar',
    'tray.animOn': 'Her zaman açık',
    'tray.animSystem': 'Windows ayarını izle',
    'tray.animOff': 'Kapalı',
    'tray.demo': 'Demo: tüm durumları göster',
    'tray.clear': 'Tüm oturumları temizle',
    'tray.quit': 'Çıkış',

    'main.denied': 'CC Island üzerinden reddedildi',
    'main.waitingPermission': '{tool} izni bekliyor',
    'main.waitingInput': 'Girdi bekliyor',
    'main.tasks.one': '1 görev',
    'main.tasks.many': '{n} görev',
    'main.edits.one': '1 düzenleme',
    'main.edits.many': '{n} düzenleme',
  },
};

const api = {
  DICT,
  /** 'auto' | 'en' | 'tr' -> 'en' | 'tr' */
  resolve(pref, systemLocale) {
    if (pref === 'en' || pref === 'tr') return pref;
    return /^tr\b/i.test(String(systemLocale || '')) ? 'tr' : 'en';
  },
  lang: 'en',
  setLang(l) { this.lang = DICT[l] ? l : 'en'; },
  get locale() { return this.lang === 'tr' ? 'tr-TR' : 'en-US'; },
  t(key, vars) {
    const table = DICT[this.lang] || DICT.en;
    let s = table[key] != null ? table[key] : DICT.en[key] != null ? DICT.en[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  },
  /** plural: picks `${key}.one` for n === 1, otherwise `${key}.many` */
  plural(key, n, vars) { return this.t(key + (n === 1 ? '.one' : '.many'), { n, ...(vars || {}) }); },
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.I18N = api;
