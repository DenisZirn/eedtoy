@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

if not exist node_modules\.bin\vite.cmd (
  echo Installiere npm-Abhaengigkeiten ...
  call npm install
  if errorlevel 1 goto :error
)

echo Erstelle eingebettete Python-Laufzeit ...
call npm run python:embed
if errorlevel 1 goto :error

echo Erstelle Windows-Installer ...
call npm run build:installer
if errorlevel 1 goto :error

echo.
echo Fertig. Installer unter dist-exe\
pause
exit /b 0

:error
echo.
echo Build fehlgeschlagen.
pause
exit /b 1
