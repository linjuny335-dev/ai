@echo off
REM ==========================================================
REM  BLUEYARD R3F - one click local preview
REM  Serves the built dist/ folder, then opens your browser.
REM  Double click this file. Close the black window to stop.
REM ==========================================================
setlocal
cd /d "%~dp0"

echo.
echo  ==========================================
echo   BLUEYARD R3F  -  local preview
echo  ==========================================
echo.

REM --- Node.js / npm: use PATH, fall back to the default install dir ---
where npm >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else (
    echo  [!] Node.js / npm not found.
    echo      Install Node 18 or newer, then run this again.
    echo.
    pause
    exit /b 1
  )
)

REM --- Already running? Then just open the browser ---
curl -s -o nul --max-time 2 http://127.0.0.1:4173/ >nul 2>nul
if not errorlevel 1 (
  echo  Server already running on http://127.0.0.1:4173
  echo  Opening browser...
  start "" "http://127.0.0.1:4173/"
  exit /b 0
)

REM --- Dependencies ---
if not exist "node_modules\" (
  echo  [1/3] installing dependencies ^(first run, takes a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo  [!] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo  [1/3] dependencies: OK
)

REM --- Build ---
if not exist "dist\index.html" (
  echo  [2/3] building production bundle...
  call npm run build
  if errorlevel 1 (
    echo  [!] build failed.
    pause
    exit /b 1
  )
) else (
  echo  [2/3] build output: OK
)

REM --- Serve + open ---
echo  [3/3] starting server on http://127.0.0.1:4173
start "BLUEYARD preview" cmd /k "npm run preview"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:4173/"

echo.
echo  Browser should be open now.
echo  The "BLUEYARD preview" window is the server - close it to stop.
echo  This window closes in 5 seconds...
timeout /t 5 /nobreak >nul
endlocal
