@echo off
setlocal
cd /d "%~dp0"
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm fehlt. Installiere Node.js LTS und fuehre dann aus:
  echo corepack enable
  echo corepack prepare pnpm@9 --activate
  pause
  exit /b 1
)
pnpm install --no-frozen-lockfile
if errorlevel 1 goto :error
pnpm build
if errorlevel 1 goto :error
echo.
echo Fertig. Installer: src-tauri\target\release\bundle\nsis\
echo Einzelne EXE: src-tauri\target\release\blue-moth.exe
pause
exit /b 0
:error
echo Build fehlgeschlagen. Pruefe Rust (rustup) und die Microsoft C++ Build Tools.
pause
exit /b 1
