$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Requirements = Join-Path $ScriptDir "requirements.txt"
$RuntimeDir = Join-Path $env:APPDATA "EEDTOY\python-runtime"
$VenvPython = Join-Path $RuntimeDir "Scripts\python.exe"

function Test-PythonCmd($Cmd, $Args) {
  try {
    $out = & $Cmd @Args -c "import sys; print(sys.version_info[0])" 2>$null
    if (($LASTEXITCODE -eq 0) -and (($out | Select-Object -Last 1) -eq "3")) {
      return $true
    }
  } catch {}
  return $false
}

function Find-Python3 {
  if (Test-PythonCmd "py" @("-3.12")) { return @{ Cmd = "py"; Args = @("-3.12") } }
  if (Test-PythonCmd "py" @("-3")) { return @{ Cmd = "py"; Args = @("-3") } }
  if (Test-PythonCmd "python" @()) { return @{ Cmd = "python"; Args = @() } }
  if (Test-PythonCmd "python3" @()) { return @{ Cmd = "python3"; Args = @() } }
  return $null
}

Write-Host "EEDTOY Python-Laufzeit wird geprüft..."

$Python = Find-Python3
if ($null -eq $Python) {
  Write-Host "Python 3 wurde nicht gefunden. Installation über winget wird gestartet..."
  try {
    winget install -e --id Python.Python.3.12 --silent --scope user --accept-package-agreements --accept-source-agreements
  } catch {
    Write-Host "winget-Installation fehlgeschlagen: $($_.Exception.Message)"
  }
  $Python = Find-Python3
}

if ($null -eq $Python) {
  Write-Host "Python 3 konnte nicht automatisch installiert werden."
  exit 1
}

if (!(Test-Path $VenvPython)) {
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  Write-Host "Erstelle private EEDTOY Python-Umgebung: $RuntimeDir"
  & $Python.Cmd @($Python.Args + @("-m", "venv", $RuntimeDir))
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Installiere/aktualisiere Python-Pakete für EEDTOY..."
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $VenvPython -m pip install --upgrade -r $Requirements
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $VenvPython -c "import serial, serial_asyncio, aiocoap, yaml, eltakobus; from eltakobus.serial import RS485SerialInterfaceV2; print('EEDTOY Python runtime OK')"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "EEDTOY Python-Laufzeit ist bereit."
exit 0
