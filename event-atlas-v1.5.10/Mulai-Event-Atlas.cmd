@echo off
setlocal
cd /d "%~dp0"
set "ATLAS_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
where node >nul 2>nul
if errorlevel 1 if exist "%ATLAS_RUNTIME%\node\bin\node.exe" set "PATH=%ATLAS_RUNTIME%\node\bin;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum tersedia. Pasang Node.js 20 atau lebih baru dari https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\playwright\package.json" if exist "%ATLAS_RUNTIME%\node\node_modules\playwright\package.json" set "EVENT_ATLAS_MODULES=%ATLAS_RUNTIME%\node\node_modules"
if not exist "node_modules\playwright\package.json" if not defined EVENT_ATLAS_MODULES (
  echo Menyiapkan dependensi audit dari npm...
  call npm install
  if errorlevel 1 exit /b 1
  call npx playwright install chromium
  if errorlevel 1 exit /b 1
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "EVENT_ATLAS_BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined EVENT_ATLAS_BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EVENT_ATLAS_BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
echo Buka http://127.0.0.1:4318/ di browser.
echo Biarkan jendela ini terbuka selama audit. Ctrl+C untuk keluar.
node server.mjs
pause
