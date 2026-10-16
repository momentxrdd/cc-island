param([int]$SelfPid = 0)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch {}
Add-Type -Namespace CcUtil -Name Proc -MemberDefinition '[DllImport("psapi.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr h, int min, int max);'
function Trim-WS { try { [void][CcUtil.Proc]::SetProcessWorkingSetSize([System.Diagnostics.Process]::GetCurrentProcess().Handle, -1, -1) } catch {} }
Trim-WS

Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f1(); int f2(); int f3(); int f4(); int f5(); int f6();
  int GetMasterVolumeLevelScalar(out float level);
  int f8(); int f9(); int f10(); int f11(); int f12();
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f1();
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

public static class CcAudio {
  static IAudioEndpointVolume vol;
  static DateTime got = DateTime.MinValue;
  static IAudioEndpointVolume Get() {
    // varsayılan cihaz değişebilir (kulaklık takıldı vb.): birkaç saniyede bir yeniden al
    if (vol == null || (DateTime.Now - got).TotalSeconds > 3) {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice dev;
      if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) { vol = null; return null; }
      var iid = typeof(IAudioEndpointVolume).GUID;
      object o;
      if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) { vol = null; return null; }
      vol = (IAudioEndpointVolume)o; got = DateTime.Now;
    }
    return vol;
  }
  // -1: ses cihazı yok
  public static int Level() { try { var v = Get(); float l; if (v == null || v.GetMasterVolumeLevelScalar(out l) != 0) return -1; return (int)Math.Round(l * 100); } catch { vol = null; return -1; } }
  public static bool Muted() { try { var v = Get(); bool m; return v != null && v.GetMute(out m) == 0 && m; } catch { return false; } }
}
'@

Add-Type -Language CSharp @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CcFs {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  // "0" = yok; "1|d3d|x,y,w,h" = var
  public static string State(int selfPid) {
    int quns = 0; try { SHQueryUserNotificationState(out quns); } catch {}
    bool d3d = quns == 3, pres = quns == 4;
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return d3d || pres ? "1|" + (d3d ? 1 : 0) + "|" : "0";
    int pid; GetWindowThreadProcessId(h, out pid);
    if (pid == selfPid) return "0";
    var sb = new StringBuilder(64); GetClassName(h, sb, 64);
    string cls = sb.ToString();
    if (System.Array.IndexOf(new[] { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "XamlExplorerHostIslandWindow", "MultitaskingViewFrame",
      "ForegroundStaging", "TaskSwitcherWnd", "TaskListThumbnailWnd", "Windows.UI.Core.CoreWindow", "Shell_InputSwitchTopLevelWindow",
      "TopLevelWindowForOverflowXamlIsland", "NotifyIconOverflowWindow", "Xaml_WindowedPopupClass", "LockScreenControllerProxyWindow", "#32768" }, cls) >= 0) return "0";
    try {
      var name = System.Diagnostics.Process.GetProcessById(pid).ProcessName.ToLowerInvariant();
      if (System.Array.IndexOf(new[] { "explorer", "shellexperiencehost", "startmenuexperiencehost", "searchhost", "searchapp", "lockapp", "textinputhost", "dwm", "logonui", "shellhost", "widgets" }, name) >= 0) return "0";
    } catch {}
    RECT r; if (!GetWindowRect(h, out r)) return "0";
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "0";
    var m = mi.rcMonitor;
    bool covers = r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B;
    // başlık çubuğu yoksa (WS_CAPTION) tam ekran sayılır; görev çubuğu otomatik gizliyken ekranı kaplayan büyütülmüş pencere sayılmaz
    bool caption = (GetWindowLong(h, -16) & 0x00C00000) == 0x00C00000;
    bool fs = covers && (!caption || quns == 2 || d3d || pres);
    if (!fs && !d3d && !pres) return "0";
    return "1|" + (d3d ? 1 : 0) + "|" + m.L + "," + m.T + "," + (m.R - m.L) + "," + (m.B - m.T);
  }
}
'@

function Emit($o) { $script:lastEmitAt = [DateTime]::Now; [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$cmdTask = $stdin.ReadLineAsync()
$lastVol = $null; $lastMute = $null; $lastBri = $null; $briAt = [DateTime]::MinValue; $hasBri = $true
$lastEmitAt = [DateTime]::Now; $trimAt = [DateTime]::Now.AddSeconds(60)
$fm = $null
try {
  $null = [Windows.UI.Shell.FocusSessionManager, Windows.UI.Shell, ContentType = WindowsRuntime]
  if ([Windows.UI.Shell.FocusSessionManager]::IsSupported) { $fm = [Windows.UI.Shell.FocusSessionManager]::GetDefault() }
} catch {}
$lastFocus = $null; $focusAt = [DateTime]::MinValue
$lastGame = $null; $gameAt = [DateTime]::MinValue

while ($true) {
  if ($cmdTask.IsCompleted) {
    $line = $cmdTask.Result
    if ($null -eq $line -or $line.Trim() -eq 'quit') { break }
    $cmdTask = $stdin.ReadLineAsync()
  }

  $v = [CcAudio]::Level(); $m = [CcAudio]::Muted()
  if ($v -ge 0 -and ($v -ne $lastVol -or $m -ne $lastMute)) {
    Emit @{ vol = $v; muted = $m; init = ($null -eq $lastVol) }
    $lastVol = $v; $lastMute = $m
  }

  if ($hasBri -and ([DateTime]::Now - $briAt).TotalMilliseconds -ge 1500) {
    $briAt = [DateTime]::Now
    $b = (Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness
    if ($null -eq $b) { $hasBri = $false }
    elseif ($b -ne $lastBri) { Emit @{ bri = [int]$b; init = ($null -eq $lastBri) }; $lastBri = $b }
  }
  if ($fm -and ([DateTime]::Now - $focusAt).TotalMilliseconds -ge 2000) {
    $focusAt = [DateTime]::Now
    $f = [bool]$fm.IsFocusActive
    if ($f -ne $lastFocus) { Emit @{ focus = $f; init = ($null -eq $lastFocus) }; $lastFocus = $f }
  }
  if (([DateTime]::Now - $gameAt).TotalMilliseconds -ge 1000) {
    $gameAt = [DateTime]::Now
    $g = [CcFs]::State($SelfPid)
    if ($g -ne $lastGame) {
      $parts = $g.Split('|')
      $mon = @(); if ($parts.Length -ge 3 -and $parts[2]) { $mon = @($parts[2].Split(',') | ForEach-Object { [int]$_ }) }
      Emit @{ game = ($parts[0] -eq '1'); d3d = ($parts.Length -ge 2 -and $parts[1] -eq '1'); mon = $mon }
      $lastGame = $g
    }
  }
  if ([DateTime]::Now -ge $trimAt) {
    $trimAt = [DateTime]::Now.AddSeconds(60)
    if (([DateTime]::Now - $lastEmitAt).TotalSeconds -ge 45) { Trim-WS }
  }
  Start-Sleep -Milliseconds 150
}
