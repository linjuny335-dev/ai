@echo off
REM ==========================================================
REM  BLUEYARD R3F - dev server with hot reload
REM  Edit any file under src/ and the page updates instantly.
REM  Double click this file. Close the black window to stop.
REM ==========================================================
setlocal
cd /d "%~dp0"

echo.
echo  ==========================================
echo   BLUEYARD R3F  -  dev mode (hot reload)
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js not found in PATH.
  echo      Install Node 18 or newer, then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  installing dependencies ^(first run, takes a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo  [!] npm install failed.
    pause
    exit /b 1
  )
)

echo  starting dev server on http://127.0.0.1:5183
start "BLUEYARD dev" cmd /k "npm run dev"
timeout /t 6 /nobreak >nul
start "" "http://127.0.0.1:5183/"

echo.
echo  Browser should be open now.
echo  The "BLUEYARD dev" window is the server - close it to stop.
echo.
pause
endlocal
