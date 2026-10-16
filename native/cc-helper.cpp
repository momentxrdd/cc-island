#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>
#include <wbemidl.h>
#include <comdef.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.UI.Shell.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <deque>
#include <iostream>
#include <mutex>
#include <optional>
#include <regex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

using namespace winrt;
using namespace std::chrono;
namespace WMC = winrt::Windows::Media::Control;
namespace WSS = winrt::Windows::Storage::Streams;
namespace WGI = winrt::Windows::Graphics::Imaging;

static std::string utf8(const std::wstring_view w) {
  if (w.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
  return s;
}
static std::string jstr(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); o += b; }
        else o += (char)c;
    }
  }
  return o + "\"";
}
static std::string jstr(const std::wstring_view w) { return jstr(utf8(w)); }
static const char* jb(bool b) { return b ? "true" : "false"; }

static void emit(const std::string& json) {
  fwrite(json.data(), 1, json.size(), stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static std::mutex qmu;
static std::deque<std::string> cmds;
static std::atomic<bool> quitting{ false };
static void startStdin() {
  std::thread([] {
    std::string line;
    while (std::getline(std::cin, line)) {
      while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
      if (line == "quit") break;
      std::lock_guard<std::mutex> g(qmu);
      cmds.push_back(line);
    }
    quitting = true;
  }).detach();
}
static std::optional<std::string> nextCmd() {
  std::lock_guard<std::mutex> g(qmu);
  if (cmds.empty()) return std::nullopt;
  auto c = cmds.front(); cmds.pop_front();
  return c;
}

static void trimWS() { SetProcessWorkingSetSize(GetCurrentProcess(), (SIZE_T)-1, (SIZE_T)-1); }
static int64_t nowMs() { return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count(); }

static std::string argOf(int argc, wchar_t** argv, const wchar_t* name, const char* def) {
  for (int i = 1; i + 1 < argc; i++) if (_wcsicmp(argv[i], name) == 0) return utf8(argv[i + 1]);
  return def;
}

static std::string appName(std::wstring id) {
  auto bang = id.rfind(L'!');
  if (bang != std::wstring::npos) id = id.substr(bang + 1);
  if (id.size() > 4 && _wcsicmp(id.c_str() + id.size() - 4, L".exe") == 0) id.resize(id.size() - 4);
  auto bs = id.rfind(L'\\'); if (bs != std::wstring::npos) id = id.substr(bs + 1);
  auto dot = id.rfind(L'.'); if (dot != std::wstring::npos) id = id.substr(dot + 1);
  if (std::regex_match(id, std::wregex(L"^[0-9A-F]{16}$"))) return "Firefox";
  if (_wcsicmp(id.c_str(), L"msedge") == 0) return "Edge";
  if (_wcsicmp(id.c_str(), L"chrome") == 0) return "Chrome";
  return utf8(id);
}

static std::string base64(const uint8_t* p, size_t n) {
  static const char* T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string o; o.reserve((n + 2) / 3 * 4);
  for (size_t i = 0; i < n; i += 3) {
    uint32_t v = p[i] << 16 | (i + 1 < n ? p[i + 1] << 8 : 0) | (i + 2 < n ? p[i + 2] : 0);
    o += T[v >> 18 & 63]; o += T[v >> 12 & 63];
    o += i + 1 < n ? T[v >> 6 & 63] : '='; o += i + 2 < n ? T[v & 63] : '=';
  }
  return o;
}

static std::string getArt(const WMC::GlobalSystemMediaTransportControlsSessionMediaProperties& props) {
  try {
    auto ref = props.Thumbnail();
    if (!ref) return {};
    auto in = ref.OpenReadAsync().get();
    auto dec = WGI::BitmapDecoder::CreateAsync(in).get();
    WGI::BitmapTransform tf; tf.ScaledWidth(192); tf.ScaledHeight(192); tf.InterpolationMode(WGI::BitmapInterpolationMode::Fant);
    auto bmp = dec.GetSoftwareBitmapAsync(WGI::BitmapPixelFormat::Bgra8, WGI::BitmapAlphaMode::Ignore, tf,
      WGI::ExifOrientationMode::IgnoreExifOrientation, WGI::ColorManagementMode::DoNotColorManage).get();
    WSS::InMemoryRandomAccessStream out;
    auto enc = WGI::BitmapEncoder::CreateAsync(WGI::BitmapEncoder::JpegEncoderId(), out).get();
    enc.SetSoftwareBitmap(bmp);
    enc.FlushAsync().get();
    auto size = (uint32_t)out.Size();
    out.Seek(0);
    WSS::Buffer buf(size);
    auto got = out.ReadAsync(buf, size, WSS::InputStreamOptions::None).get();
    return "data:image/jpeg;base64," + base64(got.data(), got.Length());
  } catch (...) { return {}; }
}

static const char* statusName(WMC::GlobalSystemMediaTransportControlsSessionPlaybackStatus s) {
  using S = WMC::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
  switch (s) {
    case S::Closed: return "Closed"; case S::Opened: return "Opened"; case S::Changing: return "Changing";
    case S::Stopped: return "Stopped"; case S::Playing: return "Playing"; case S::Paused: return "Paused";
  }
  return "Unknown";
}

static int runMedia(const std::string& source) {
  WMC::GlobalSystemMediaTransportControlsSessionManager mgr{ nullptr };
  try { mgr = WMC::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get(); } catch (...) {}
  if (!mgr) { emit(R"({"none":true,"error":"smtc"})"); return 1; }
  const bool all = source == "all";

  WMC::GlobalSystemMediaTransportControlsSession session{ nullptr };
  std::string lastKey, lastTrack;
  int64_t lastEmit = 0, lastPoll = 0, lastEmitAt = nowMs(), trimAt = nowMs() + 60000;
  int artVer = 0, missStreak = 0;
  const int missGrace = 3;
  bool hadSession = false;

  while (!quitting) {
    while (auto c = nextCmd()) {
      if (!session) continue;
      try {
        if (*c == "toggle") session.TryTogglePlayPauseAsync().get();
        else if (*c == "play") session.TryPlayAsync().get();
        else if (*c == "pause") session.TryPauseAsync().get();
        else if (*c == "next") session.TrySkipNextAsync().get();
        else if (*c == "prev") session.TrySkipPreviousAsync().get();
        else if (c->rfind("seek:", 0) == 0) session.TryChangePlaybackPositionAsync(std::stoll(c->substr(5)) * 10000).get();
      } catch (...) {}
      lastPoll = 0;
    }

    int64_t now = nowMs();
    if (now - lastPoll >= 1000) {
      lastPoll = now;
      session = nullptr;
      try {
        auto list = mgr.GetSessions();
        if (all) {
          for (auto const& s : list) if (s.GetPlaybackInfo().PlaybackStatus() == WMC::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) { session = s; break; }
          if (!session) session = mgr.GetCurrentSession();
        } else {
          for (auto const& s : list) { std::wstring id{ s.SourceAppUserModelId() }; if (id.find(L"Spotify") != std::wstring::npos) { session = s; break; } }
        }
      } catch (...) { session = nullptr; }

      if (!session) {
        if (hadSession && ++missStreak >= missGrace) { emit(R"({"none":true})"); hadSession = false; lastKey.clear(); missStreak = 0; lastEmitAt = now; }
      } else {
        missStreak = 0; hadSession = true;
        try {
          auto props = session.TryGetMediaPropertiesAsync().get();
          auto info = session.GetPlaybackInfo();
          auto tl = session.GetTimelineProperties();
          const char* status = statusName(info.PlaybackStatus());
          int64_t durMs = duration_cast<milliseconds>(tl.EndTime() - tl.StartTime()).count();
          double pos = (double)duration_cast<milliseconds>(tl.Position()).count();
          if (strcmp(status, "Playing") == 0) pos += (double)duration_cast<milliseconds>(winrt::clock::now() - tl.LastUpdatedTime()).count();
          if (durMs > 0 && pos > durMs) pos = (double)durMs;
          if (pos < 0) pos = 0;
          std::string title = utf8(props.Title()), artist = utf8(props.Artist()), album = utf8(props.AlbumTitle());
          std::string track = title + "|" + artist + "|" + album;
          std::string key = track + "|" + status + "|" + std::to_string(durMs);
          if (key != lastKey || now - lastEmit >= 5000) {
            auto ctl = info.Controls();
            std::string o = "{\"app\":" + jstr(appName(std::wstring{ session.SourceAppUserModelId() })) +
              ",\"title\":" + jstr(title) + ",\"artist\":" + jstr(artist) + ",\"album\":" + jstr(album) +
              ",\"status\":" + jstr(std::string(status)) + ",\"posMs\":" + std::to_string((int64_t)pos) + ",\"durMs\":" + std::to_string(durMs) +
              ",\"at\":" + std::to_string(now) + ",\"canPrev\":" + jb(ctl.IsPreviousEnabled()) + ",\"canNext\":" + jb(ctl.IsNextEnabled()) +
              ",\"canSeek\":" + jb(ctl.IsPlaybackPositionEnabled());
            bool newArt = track != lastTrack || artVer == 0;
            if (newArt) {
              auto art = getArt(props);
              artVer++;
              o += ",\"art\":" + (art.empty() ? std::string("null") : jstr(art));
              lastTrack = track;
            }
            o += ",\"artVer\":" + std::to_string(artVer) + "}";
            emit(o);
            if (newArt) trimWS();
            lastKey = key; lastEmit = now; lastEmitAt = now;
          }
        } catch (...) {}
      }
    }
    if (now >= trimAt) { trimAt = now + 60000; if (now - lastEmitAt >= 45000) trimWS(); }
    Sleep(120);
  }
  return 0;
}

static com_ptr<IAudioEndpointVolume> g_vol;
static int64_t g_volAt = 0;
static IAudioEndpointVolume* volume() {
  int64_t now = nowMs();
  if (g_vol && now - g_volAt < 3000) return g_vol.get();
  g_vol = nullptr;
  com_ptr<IMMDeviceEnumerator> en;
  if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), en.put_void()))) return nullptr;
  com_ptr<IMMDevice> dev;
  if (FAILED(en->GetDefaultAudioEndpoint(eRender, eMultimedia, dev.put()))) return nullptr;
  if (FAILED(dev->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, g_vol.put_void()))) { g_vol = nullptr; return nullptr; }
  g_volAt = now;
  return g_vol.get();
}

static com_ptr<IWbemServices> g_wmi;
static int brightness() {
  if (!g_wmi) {
    com_ptr<IWbemLocator> loc;
    if (FAILED(CoCreateInstance(CLSID_WbemLocator, nullptr, CLSCTX_INPROC_SERVER, IID_IWbemLocator, loc.put_void()))) return -1;
    if (FAILED(loc->ConnectServer(_bstr_t(L"ROOT\\WMI"), nullptr, nullptr, nullptr, 0, nullptr, nullptr, g_wmi.put()))) return -1;
    CoSetProxyBlanket(g_wmi.get(), RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, nullptr, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, nullptr, EOAC_NONE);
  }
  com_ptr<IEnumWbemClassObject> it;
  if (FAILED(g_wmi->ExecQuery(_bstr_t(L"WQL"), _bstr_t(L"SELECT CurrentBrightness FROM WmiMonitorBrightness"),
      WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, nullptr, it.put()))) return -1;
  com_ptr<IWbemClassObject> obj; ULONG n = 0;
  if (FAILED(it->Next(2000, 1, obj.put(), &n)) || n == 0) return -1;
  VARIANT v; VariantInit(&v);
  int r = -1;
  if (SUCCEEDED(obj->Get(L"CurrentBrightness", 0, &v, nullptr, nullptr))) { r = v.vt == VT_UI1 ? v.bVal : v.vt == VT_I4 ? v.lVal : -1; }
  VariantClear(&v);
  return r;
}

struct Game { bool fs = false, d3d = false; RECT mon{}; bool operator!=(const Game& o) const {
  return fs != o.fs || d3d != o.d3d || memcmp(&mon, &o.mon, sizeof mon) != 0; } };
static Game gameState(DWORD selfPid) {
  Game g;
  QUERY_USER_NOTIFICATION_STATE q = QUNS_ACCEPTS_NOTIFICATIONS;
  SHQueryUserNotificationState(&q);
  bool d3d = q == QUNS_RUNNING_D3D_FULL_SCREEN, pres = q == QUNS_PRESENTATION_MODE;
  HWND h = GetForegroundWindow();
  if (!h || !IsWindowVisible(h)) { g.fs = d3d || pres; g.d3d = d3d; return g; }
  DWORD pid = 0; GetWindowThreadProcessId(h, &pid);
  if (pid == selfPid) return g;
  wchar_t cls[64]{}; GetClassNameW(h, cls, 64);
  if (!wcscmp(cls, L"Progman") || !wcscmp(cls, L"WorkerW") || !wcscmp(cls, L"Shell_TrayWnd") || !wcscmp(cls, L"Shell_SecondaryTrayWnd")) return g;
  RECT r; if (!GetWindowRect(h, &r)) return g;
  MONITORINFO mi{ sizeof mi };
  if (!GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mi)) return g;
  const RECT& m = mi.rcMonitor;
  bool covers = r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
  bool caption = (GetWindowLongW(h, GWL_STYLE) & WS_CAPTION) == WS_CAPTION;
  bool fs = covers && (!caption || q == QUNS_BUSY || d3d || pres);
  if (!fs && !d3d && !pres) return g;
  g.fs = true; g.d3d = d3d; g.mon = m;
  return g;
}

static int runSystem(DWORD selfPid) {
  int lastVol = -2; bool lastMute = false;
  int lastBri = -2; bool hasBri = true; int64_t briAt = 0;
  std::optional<bool> lastFocus; int64_t focusAt = 0;
  std::optional<Game> lastGame; int64_t gameAt = 0;
  int64_t lastEmitAt = nowMs(), trimAt = nowMs() + 60000;

  winrt::Windows::UI::Shell::FocusSessionManager fm{ nullptr };
  try { if (winrt::Windows::UI::Shell::FocusSessionManager::IsSupported()) fm = winrt::Windows::UI::Shell::FocusSessionManager::GetDefault(); } catch (...) {}

  while (!quitting) {
    while (nextCmd()) {}
    int64_t now = nowMs();

    if (auto v = volume()) {
      float lvl = 0; BOOL mute = FALSE;
      if (SUCCEEDED(v->GetMasterVolumeLevelScalar(&lvl))) {
        v->GetMute(&mute);
        int vol = (int)lround(lvl * 100);
        if (vol != lastVol || (bool)mute != lastMute) {
          emit("{\"vol\":" + std::to_string(vol) + ",\"muted\":" + jb(mute) + ",\"init\":" + jb(lastVol == -2) + "}");
          lastVol = vol; lastMute = mute; lastEmitAt = now;
        }
      } else g_vol = nullptr;
    }

    if (hasBri && now - briAt >= 1500) {
      briAt = now;
      int b = brightness();
      if (b < 0) hasBri = false;
      else if (b != lastBri) { emit("{\"bri\":" + std::to_string(b) + ",\"init\":" + jb(lastBri == -2) + "}"); lastBri = b; lastEmitAt = now; }
    }

    if (fm && now - focusAt >= 2000) {
      focusAt = now;
      try {
        bool f = fm.IsFocusActive();
        if (!lastFocus || *lastFocus != f) { emit(std::string("{\"focus\":") + jb(f) + ",\"init\":" + jb(!lastFocus) + "}"); lastFocus = f; lastEmitAt = now; }
      } catch (...) {}
    }

    if (now - gameAt >= 1000) {
      gameAt = now;
      Game g = gameState(selfPid);
      if (!lastGame || *lastGame != g) {
        std::string mon = g.fs && (g.mon.right > g.mon.left)
          ? "[" + std::to_string(g.mon.left) + "," + std::to_string(g.mon.top) + "," + std::to_string(g.mon.right - g.mon.left) + "," + std::to_string(g.mon.bottom - g.mon.top) + "]"
          : "[]";
        emit(std::string("{\"game\":") + jb(g.fs) + ",\"d3d\":" + jb(g.d3d) + ",\"mon\":" + mon + "}");
        lastGame = g; lastEmitAt = now;
      }
    }

    if (now >= trimAt) { trimAt = now + 60000; if (now - lastEmitAt >= 45000) trimWS(); }
    Sleep(150);
  }
  return 0;
}

static int runAncestors(DWORD pid) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) { emit("[]"); return 1; }
  struct P { DWORD parent; std::wstring exe; };
  std::unordered_map<DWORD, P> all;
  PROCESSENTRY32W pe{ sizeof pe };
  for (BOOL ok = Process32FirstW(snap, &pe); ok; ok = Process32NextW(snap, &pe)) all[pe.th32ProcessID] = { pe.th32ParentProcessID, pe.szExeFile };
  CloseHandle(snap);
  std::string o = "[";
  for (int depth = 0; depth < 16 && pid; depth++) {
    auto it = all.find(pid);
    if (it == all.end()) break;
    if (depth) o += ",";
    o += "{\"pid\":" + std::to_string(pid) + ",\"name\":" + jstr(it->second.exe) + "}";
    if (it->second.parent == pid) break;
    pid = it->second.parent;
  }
  emit(o + "]");
  return 0;
}

static INPUT_RECORD key(wchar_t ch, WORD vk, bool down) {
  INPUT_RECORD r{};
  r.EventType = KEY_EVENT;
  r.Event.KeyEvent.bKeyDown = down;
  r.Event.KeyEvent.wRepeatCount = 1;
  r.Event.KeyEvent.wVirtualKeyCode = vk;
  r.Event.KeyEvent.wVirtualScanCode = (WORD)MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
  r.Event.KeyEvent.uChar.UnicodeChar = ch;
  return r;
}
static int runType(DWORD pid, const std::wstring& text) {
  FreeConsole();
  if (!AttachConsole(pid)) { emit("{\"ok\":false,\"error\":\"attach\",\"code\":" + std::to_string(GetLastError()) + "}"); return 1; }
  HANDLE in = CreateFileW(L"CONIN$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (in == INVALID_HANDLE_VALUE) { FreeConsole(); emit(R"({"ok":false,"error":"conin"})"); return 1; }
  std::vector<INPUT_RECORD> recs;
  for (wchar_t c : text) {
    if (c == L'\r' || c == L'\n') c = L' ';
    SHORT vk = VkKeyScanW(c);
    WORD v = vk == -1 ? 0 : (WORD)(vk & 0xff);
    recs.push_back(key(c, v, true));
    recs.push_back(key(c, v, false));
  }
  DWORD n = 0;
  bool ok = recs.empty() || WriteConsoleInputW(in, recs.data(), (DWORD)recs.size(), &n);
  Sleep(180);
  INPUT_RECORD enter[2] = { key(L'\r', VK_RETURN, true), key(L'\r', VK_RETURN, false) };
  ok = ok && WriteConsoleInputW(in, enter, 2, &n);
  CloseHandle(in);
  FreeConsole();
  emit(std::string("{\"ok\":") + jb(ok) + "}");
  return ok ? 0 : 1;
}

int wmain(int argc, wchar_t** argv) {
  SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS);
  SetConsoleOutputCP(CP_UTF8);
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  CoInitializeSecurity(nullptr, -1, nullptr, nullptr, RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IMPERSONATE, nullptr, EOAC_NONE, nullptr);
  startStdin();
  trimWS();
  std::wstring mode = argc > 1 ? argv[1] : L"";
  if (mode == L"media") return runMedia(argOf(argc, argv, L"--source", "spotify"));
  if (mode == L"system") return runSystem((DWORD)std::stoul(argOf(argc, argv, L"--self-pid", "0")));
  if (mode == L"ancestors") return runAncestors((DWORD)std::stoul(argOf(argc, argv, L"--pid", "0")));
  if (mode == L"type") {
    std::wstring text;
    for (int i = 1; i + 1 < argc; i++) if (_wcsicmp(argv[i], L"--text") == 0) text = argv[i + 1];
    return runType((DWORD)std::stoul(argOf(argc, argv, L"--pid", "0")), text);
  }
  fprintf(stderr, "usage: cc-helper media [--source spotify|all] | system [--self-pid N] | ancestors --pid N | type --pid N --text T\n");
  return 2;
}
