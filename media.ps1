param([string]$Source = 'spotify')
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch {}
Add-Type -Namespace CcUtil -Name Proc -MemberDefinition '[DllImport("psapi.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr h, int min, int max);'
function Trim-WS { try { [void][CcUtil.Proc]::SetProcessWorkingSetSize([System.Diagnostics.Process]::GetCurrentProcess().Handle, -1, -1) } catch {} }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $t.Wait(4000)) { return $null }
  return $t.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { [Console]::Out.WriteLine('{"none":true,"error":"smtc"}'); exit 1 }

function App-Name($id) {
  $n = [string]$id
  if ($n -match '!') { $n = $n.Split('!')[-1] }
  $n = ($n -replace '\.exe$', '').Split('\')[-1].Split('.')[-1]
  if ($n -match '^[0-9A-F]{16}$') { return 'Firefox' }
  if ($n -match '^msedge$') { return 'Edge' }
  if ($n -match '^chrome$') { return 'Chrome' }
  return $n
}

function Emit($o) { $script:lastEmitAt = [DateTimeOffset]::UtcNow; [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

function Get-Art($props) {
  try {
    $ref = $props.Thumbnail
    if (-not $ref) { return $null }
    $rs = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $rs) { return $null }
    $stream = $asStreamForRead.Invoke($null, @($rs))
    $img = [System.Drawing.Image]::FromStream($stream)
    $bmp = New-Object System.Drawing.Bitmap 192, 192
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, 192, 192)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose(); $stream.Dispose()
    return 'data:image/jpeg;base64,' + [Convert]::ToBase64String($ms.ToArray())
  } catch { return $null }
}

$session = $null
$lastKey = ''; $lastEmit = 0; $lastPoll = 0; $artVer = 0; $hadSession = $false
$lastEmitAt = [DateTimeOffset]::UtcNow; $trimAt = [DateTimeOffset]::UtcNow.AddSeconds(60)
$missStreak = 0; $missGrace = 3
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$cmdTask = $stdin.ReadLineAsync()
$epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

while ($true) {
  if ($cmdTask.IsCompleted) {
    $line = $cmdTask.Result
    if ($null -eq $line) { break }
    $cmdTask = $stdin.ReadLineAsync()
    $line = $line.Trim()
    if ($line -eq 'quit') { break }
    if ($session) {
      try {
        switch -Regex ($line) {
          '^toggle$' { [void](Await ($session.TryTogglePlayPauseAsync()) ([bool])) }
          '^play$'   { [void](Await ($session.TryPlayAsync()) ([bool])) }
          '^pause$'  { [void](Await ($session.TryPauseAsync()) ([bool])) }
          '^next$'   { [void](Await ($session.TrySkipNextAsync()) ([bool])) }
          '^prev$'   { [void](Await ($session.TrySkipPreviousAsync()) ([bool])) }
          '^seek:(\d+)$' { [void](Await ($session.TryChangePlaybackPositionAsync([long]$Matches[1] * 10000)) ([bool])) }
        }
      } catch {}
      $lastPoll = 0
    }
  }

  $now = [DateTimeOffset]::UtcNow
  $nowMs = [long]($now - $epoch).TotalMilliseconds
  if ($nowMs - $lastPoll -ge 1000) {
    $lastPoll = $nowMs
    $session = $null
    try {
      if ($Source -eq 'all') {
        foreach ($s in $mgr.GetSessions()) { if ([string]$s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { $session = $s; break } }
        if (-not $session) { $session = $mgr.GetCurrentSession() }
      } else {
        foreach ($s in $mgr.GetSessions()) { if ($s.SourceAppUserModelId -match 'Spotify') { $session = $s; break } }
      }
    } catch {}

    if (-not $session) {
      $missStreak++
      if ($hadSession -and $missStreak -ge $missGrace) { Emit @{ none = $true }; $hadSession = $false; $lastKey = ''; $missStreak = 0 }
    } else {
      $missStreak = 0
      $hadSession = $true
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $session.GetPlaybackInfo()
      $tl = $session.GetTimelineProperties()
      $status = [string]$info.PlaybackStatus
      $durMs = [long]($tl.EndTime.TotalMilliseconds - $tl.StartTime.TotalMilliseconds)
      $pos = $tl.Position.TotalMilliseconds
      if ($status -eq 'Playing') { $pos += ($now - $tl.LastUpdatedTime).TotalMilliseconds }
      if ($durMs -gt 0 -and $pos -gt $durMs) { $pos = $durMs }
      if ($pos -lt 0) { $pos = 0 }
      $key = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)|$status|$durMs"
      $trackKey = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
      $changed = ($key -ne $lastKey)
      if ($changed -or ($nowMs - $lastEmit -ge 5000)) {
        $o = @{
          app = (App-Name $session.SourceAppUserModelId); title = [string]$props.Title; artist = [string]$props.Artist; album = [string]$props.AlbumTitle
          status = $status; posMs = [long]$pos; durMs = $durMs; at = $nowMs
          canPrev = [bool]$info.Controls.IsPreviousEnabled; canNext = [bool]$info.Controls.IsNextEnabled; canSeek = [bool]$info.Controls.IsPlaybackPositionEnabled
        }
        if (($lastKey -split '\|')[0..2] -join '|' -ne $trackKey -or $artVer -eq 0) {
          $art = Get-Art $props
          $artVer++
          $o.art = $art
        }
        $o.artVer = $artVer
        Emit $o
        if ($o.art) { Trim-WS }
        $lastKey = $key; $lastEmit = $nowMs
      }
    }
  }
  $nowD = [DateTimeOffset]::UtcNow
  if ($nowD -ge $trimAt) {
    $trimAt = $nowD.AddSeconds(60)
    if (($nowD - $lastEmitAt).TotalSeconds -ge 45) { Trim-WS }
  }
  Start-Sleep -Milliseconds 120
}
