param(
  [string]$PythonVersion = "3.12.10",
  [string]$BuildPython = "python"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root "python-runtime"
$Requirements = Join-Path $Root "python\requirements.txt"
$WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ("eedtoy-python-" + [guid]::NewGuid().ToString("N"))
$Archive = Join-Path $WorkDir "python-embed.zip"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"

try {
  if (Test-Path $RuntimeDir) {
    Remove-Item -Recurse -Force $RuntimeDir
  }
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

  Write-Host "Downloading embedded Python $PythonVersion..."
  Invoke-WebRequest -Uri $PythonUrl -OutFile $Archive -UseBasicParsing
  Expand-Archive -Path $Archive -DestinationPath $RuntimeDir -Force

  $PthFile = Join-Path $RuntimeDir "python312._pth"
  if (!(Test-Path $PthFile)) {
    throw "Embedded Python path file is missing: $PthFile"
  }

  @(
    "python312.zip"
    "."
    "Lib"
    "Lib\site-packages"
    "import site"
  ) | Set-Content -Path $PthFile -Encoding ascii

  $SitePackages = Join-Path $RuntimeDir "Lib\site-packages"
  New-Item -ItemType Directory -Force -Path $SitePackages | Out-Null

  Write-Host "Installing EEDTOY Python modules into the embedded runtime..."
  & $BuildPython -m pip install --disable-pip-version-check --no-compile --upgrade --target $SitePackages -r $Requirements
  if ($LASTEXITCODE -ne 0) {
    throw "pip failed with exit code $LASTEXITCODE"
  }

  Get-ChildItem -Path $RuntimeDir -Directory -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  $EmbeddedPython = Join-Path $RuntimeDir "python.exe"
  if (!(Test-Path $EmbeddedPython)) {
    throw "Embedded python.exe is missing."
  }

  Write-Host "Validating embedded EEDTOY Python runtime..."
  & $EmbeddedPython -I -c "import serial, serial_asyncio, aiocoap, yaml, eltakobus; from eltakobus.serial import RS485SerialInterfaceV2; print('EEDTOY embedded Python runtime OK')"
  if ($LASTEXITCODE -ne 0) {
    throw "Embedded Python validation failed with exit code $LASTEXITCODE"
  }

  $VersionOutput = & $EmbeddedPython -I -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
  Set-Content -Path (Join-Path $RuntimeDir "EEDTOY_RUNTIME_VERSION.txt") -Value @(
    "Python=$VersionOutput"
    "Eltako14Bus=0.0.82"
    "Runtime=embedded"
  ) -Encoding ascii

  Write-Host "Embedded EEDTOY Python runtime is ready: $RuntimeDir"
}
finally {
  if (Test-Path $WorkDir) {
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
  }
}
