param([string]$Mode = 'events', [int]$Days = 2, [int]$Minutes = 25, [long]$From = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Out($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)) }

try {
  if ($Mode -like 'focus-*') {
    $null = [Windows.UI.Shell.FocusSessionManager, Windows.UI.Shell, ContentType = WindowsRuntime]
    if (-not [Windows.UI.Shell.FocusSessionManager]::IsSupported) { Out @{ ok = $false; error = 'unsupported' }; exit }
    $fm = [Windows.UI.Shell.FocusSessionManager]::GetDefault()
    if ($Mode -eq 'focus-start') {
      if ($fm.IsFocusActive) { $fm.DeactivateFocus() }
      $s = $fm.TryStartFocusSession([DateTimeOffset]::Now.AddMinutes([Math]::Max(1, $Minutes)))
      Out @{ ok = ($null -ne $s); active = $fm.IsFocusActive }
    } else {
      if ($fm.IsFocusActive) { $fm.DeactivateFocus() }
      Out @{ ok = $true; active = $false }
    }
    exit
  }

  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(15000); $task.Result }

  $null = [Windows.ApplicationModel.Appointments.AppointmentManager, Windows.ApplicationModel.Appointments, ContentType = WindowsRuntime]
  $NS = 'Windows.ApplicationModel.Appointments'
  $store = Await ([Windows.ApplicationModel.Appointments.AppointmentManager]::RequestStoreAsync([Windows.ApplicationModel.Appointments.AppointmentStoreAccessType]::AllCalendarsReadOnly)) ([Windows.ApplicationModel.Appointments.AppointmentStore])
  if (-not $store) { Out @{ ok = $false; error = 'no-access' }; exit }

  $cals = @{}
  $list = Await ($store.FindAppointmentCalendarsAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.ApplicationModel.Appointments.AppointmentCalendar]])
  foreach ($c in $list) {
    if ($c.IsHidden) { continue }
    $col = $c.DisplayColor
    $cals[$c.LocalId] = @{ name = $c.DisplayName; color = ('#{0:X2}{1:X2}{2:X2}' -f $col.R, $col.G, $col.B) }
  }

  $opt = New-Object Windows.ApplicationModel.Appointments.FindAppointmentsOptions
  $opt.MaxCount = 500
  $P = [Windows.ApplicationModel.Appointments.AppointmentProperties]
  $fp = $opt.FetchProperties
  $add = [System.Collections.Generic.ICollection[string]].GetMethod('Add')
  foreach ($p in @($P::Subject, $P::StartTime, $P::Duration, $P::AllDay, $P::Location, $P::OnlineMeetingLink, $P::Details, $P::IsCanceledMeeting, $P::BusyStatus)) {
    try { [void]$add.Invoke($fp, @([string]$p)) } catch {}
  }
  $rangeStart = if ($From -gt 0) { [DateTimeOffset]::FromUnixTimeMilliseconds($From) } else { [DateTimeOffset]::new([DateTime]::Today) }
  $apps = Await ($store.FindAppointmentsAsync($rangeStart, [TimeSpan]::FromDays($Days), $opt)) ([System.Collections.Generic.IReadOnlyList[Windows.ApplicationModel.Appointments.Appointment]])

  $epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
  $events = foreach ($a in $apps) {
    if ($a.IsCanceledMeeting) { continue }
    if (-not $cals.ContainsKey($a.CalendarId)) { continue }
    $start = [long]($a.StartTime - $epoch).TotalMilliseconds
    $end = $start + [long]$a.Duration.TotalMilliseconds
    $link = [string]$a.OnlineMeetingLink
    if (-not $link -and $a.Details) {
      $m = [regex]::Match([string]$a.Details, 'https://(teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|[\w.-]*zoom\.us|[\w.-]*webex\.com)/[^\s"<>)]+')
      if ($m.Success) { $link = $m.Value }
    }
    $cal = $cals[$a.CalendarId]
    @{ id = 'win:' + $a.LocalId + ':' + $start; title = [string]$a.Subject; location = [string]$a.Location; start = $start; end = $end
       allDay = [bool]$a.AllDay; link = $link; cal = $cal.name; color = $cal.color; free = ([string]$a.BusyStatus -eq 'Free') }
  }
  Out @{ ok = $true; calendars = @($cals.Values | ForEach-Object { $_.name }); events = @($events) }
} catch {
  Out @{ ok = $false; error = $_.Exception.Message }
}
