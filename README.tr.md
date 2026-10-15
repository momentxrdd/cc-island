<p align="center">
  <img src="assets/logo-v3.svg" width="150" alt="CC Island logosu">
</p>

<p align="center">
  <b>Windows için Claude Code'a Dynamic Island tarzı bir üst katman.</b><br>
  Claude Code oturumlarının ne yaptığını gör, izinleri pencere değiştirmeden onayla ve Spotify'ı ekranın üstündeki küçük kapsülden kontrol et.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="CHANGELOG.md">Değişiklikler</a> ·
  <a href="CONTRIBUTING.md">Katkı</a> ·
  <a href="LICENSE">Lisans</a>
</p>

---

## Ekran görüntüleri

> Ekran görüntülerinde örnek veriler kullanılmıştır.

<table>
  <tr>
    <td align="center"><img src="assets/screenshots/compact.png" width="330" alt="Kapsülde çalışan oturum"><br><sub>Kapsülde çalışan oturum</sub></td>
    <td align="center"><img src="assets/screenshots/peek.png" width="330" alt="Tüm oturumların hover listesi"><br><sub>Tüm oturumların hover listesi</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/screenshots/permission.png" width="330" alt="Onay / reddet ile izin isteği"><br><sub>Onay / reddet ile izin isteği</sub></td>
    <td align="center"><img src="assets/screenshots/full.png" width="330" alt="Diff ve görevlerle tam görünüm"><br><sub>Diff ve görevlerle tam görünüm</sub></td>
  </tr>
</table>

## Özellikler

- **Canlı oturum durumu.** Her Claude Code oturumu proje adı, durumu (çalışıyor, onay bekliyor, bitti) ve o an çalıştırdığı araçla listelenir.
- **İzin onayları.** Claude Code izin istediğinde ada, çalıştırmak istediği komutu ya da düzenlemeyi göstererek genişler. Onayla, reddet, Claude Code bir kural önerdiyse "her zaman izin ver" ya da terminale bırak. Kısayollar: onaylamak için `Ctrl+Alt+Y`, reddetmek için `Ctrl+Alt+N`.
- **Bildirimler.** Bir oturum bittiğinde, girdi istediğinde ya da hata verdiğinde kısa ve animasyonlu uyarılar. Başarı ve hata durumları ne olduğunu gösterir.
- **Tam oturum görünümü.** Adaya tıklayınca araç etkinliğini, girdileri, diff'leri ve çıktıları, Claude'un son mesajını, `TodoWrite` görev listesini, konuşmayı, token kullanımını ve değiştirilen dosyaları görürsün.
- **Spotify.** Albüm kapaklı şimdi çalıyor kartı, tıklayarak ileri sarılabilen ilerleme çubuğu ve önceki / oynat-duraklat / sonraki düğmeleri. Parça değişince kısa bir bildirim çıkar.
- **Otomatik.** Ada, bir Claude Code oturumu başlayınca açılır, oturum yokken gizlenir ve bu şekilde açıldıysa bir süre sonra kendini kapatır.
- **İngilizce ve Türkçe.** Varsayılan olarak sistem diline uyar; tepsi menüsünden değiştirebilirsin.
- **Erişilebilir hareket.** Animasyonlar Windows'un "Animasyon efektleri" ayarını izleyebilir ya da tepsi menüsünden tamamen kapatılabilir.

## Gereksinimler

- Windows 10 veya 11
- [Node.js](https://nodejs.org/) 18 veya üzeri
- [Claude Code](https://claude.com/claude-code)
- İsteğe bağlı: müzik kartı için Spotify masaüstü uygulaması

## Kurulum

Hazır Windows sürümü: [Releases](https://github.com/momentxrdd/cc-island/releases/latest). Zip dosyasını açıp `CC Island.exe` ile çalıştır, ardından aşağıda anlatıldığı gibi hook'ları kur (hook'lar için [Node.js](https://nodejs.org/) gerekir).


```bash
git clone https://github.com/momentxrdd/cc-island.git
cd cc-island
npm install
npm run install-hooks
```

`npm run install-hooks`, CC Island'ın hook'larını `~/.claude/settings.json` dosyasına ekler. Yazmadan önce aynı klasöre `settings.json.ccisland.bak` adıyla bir yedek alır. Zaten açık olan Claude Code oturumları varsa, hook'ları alması için yeniden başlat.

Adayı elle başlatmak için:

```bash
npm start
```

Bunu sürekli çalışır halde tutmana gerek yok. Hook'lar kurulduktan sonra yeni bir Claude Code oturumu başladığında ada kendiliğinden açılır.

### Kaldırma

```bash
npm run uninstall-hooks
```

Bu komut yalnızca CC Island'ın hook kayıtlarını siler, ayarlarının geri kalanına dokunmaz. Ardından proje klasörünü silebilirsin.

## Nasıl çalışır

```
Claude Code ──hook'lar──▶ hook.js ──HTTP 127.0.0.1:47321──▶ main.js ──IPC──▶ arayüz (ada)
                                      ▲                         │
                                      └────── izin yanıtı ◀─────┘

Spotify ──Windows medya oturumu──▶ media.ps1 ──▶ media.js ──▶ main.js
```

- Claude Code, her olayda (oturum başlangıcı, istem, araç kullanımı, izin isteği, bildirim, durdurma, oturum sonu) `~/.claude/settings.json` içinde tanımlı hook'ları çalıştırır.
- `hook.js` her olayı adanın `127.0.0.1` üzerindeki yerel sunucusuna iletir. İzin isteklerinde senin kararını bekler ve Claude Code'a geri verir.
- Spotify kartı, Windows medya oturumunu küçük bir PowerShell yardımcısıyla okur. Bu yüzden masaüstü uygulamasıyla API anahtarı ya da giriş gerektirmeden çalışır.

## Gizlilik

- Her şey kendi bilgisayarında kalır. Ada yalnızca `127.0.0.1`'e bağlı bir sunucuyla konuşur ve kendi başına ağ isteği yapmaz.
- Konuşmaları ve token sayılarını göstermek için Claude Code'un yerel olarak yazdığı transcript dosyalarını okur (yolu hook verisinde gelir).
- Ayarlar Electron'un kullanıcı veri klasöründe (`%APPDATA%\cc-island\settings.json`) saklanır.

## Ayarlar

Tepsi simgesine sağ tıkla:

| Menü | Seçenekler |
| --- | --- |
| Dil | Otomatik (sistem), English, Türkçe |
| Animasyonlar | Her zaman açık, Windows ayarını izle, Kapalı |

"Demo: tüm durumları göster" seçeneği, adanın tüm durumlarını sırayla gösterir.

## Klavye kısayolları

| Kısayol | İşlem |
| --- | --- |
| `Ctrl+Alt+Y` | Bekleyen en eski izin isteğini onayla |
| `Ctrl+Alt+N` | Bekleyen en eski izin isteğini reddet |

Bunlar yalnızca bekleyen bir izin isteği varken çalışır.

## Sorun giderme

- **Ada görünmüyor.** Hook'ların kurulu olduğunu (`npm run install-hooks`) ve oturumun bundan sonra başladığını kontrol et. Hook'lar oturum başlarken okunur.
- **İzin onayları terminale düşüyor.** İstek geldiğinde ada çalışmıyordu. `npm start` ile başlat ya da ada otomatik açılsın diye yeni bir oturum aç.
- **Spotify kartı yok.** Yalnızca Spotify masaüstü uygulaması algılanır. Windows medya kontrollerinde Spotify görünmelidir (çalarken ses panelinde listelenir).
- **Port kullanımda.** Ada `47321` portunu kullanır. Başka bir program bu portu kullanıyorsa, başlatmadan önce `CC_PORT` ortam değişkenine farklı bir sayı ver ve hook'ların çalıştığı ortamda da aynı değişikliği yap.
- **Animasyonlar donuk görünüyor.** Tepsi menüsündeki "Animasyonlar" ayarını kontrol et. "Windows ayarını izle" seçeneği, Windows'taki "Animasyon efektleri" kapalıysa hareketi devre dışı bırakır.

## Proje yapısı

Dosya dosya açıklama için [CONTRIBUTING.md](CONTRIBUTING.md#project-layout) dosyasına bak (İngilizce).

## Sınırlar

- Yalnızca Windows. Spotify entegrasyonu Windows medya oturumu API'lerine dayanır.
- Yalnızca Spotify takip edilir. Diğer müzik uygulamaları ve tarayıcı oynatıcıları gösterilmez.
- Ada yalnızca ana monitörde görünür.

## Markalar

CC Island bağımsız bir projedir; Anthropic ile bağlantılı değildir, onaylanmamıştır ve sponsorluğunda değildir. "Claude" ve "Claude Code", Anthropic'in ticari markalarıdır. Logoda ve arayüzde kullanılan maskot bir Claude Code varlığıdır; kendi projende yeniden kullanmadan önce Anthropic'in marka yönergelerini kontrol et.

## Lisans

[MIT](LICENSE)
