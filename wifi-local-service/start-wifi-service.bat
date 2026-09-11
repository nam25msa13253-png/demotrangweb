@echo off
cd /d %~dp0
echo ============================================
echo   Dich vu Wi-Fi cuc bo cho Kiosk (localhost:5000)
echo ============================================

REM Kiem tra xem dich vu da chay san chua (vd da tu dong khoi dong cung Windows qua
REM install-autostart.bat) truoc khi co khoi dong lai - tranh loi EADDRINUSE kho hieu.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5000/health' -UseBasicParsing -TimeoutSec 2; exit ($(if ($r.StatusCode -eq 200) {0} else {1})) } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo.
  echo Dich vu Wi-Fi da dang chay san ^(co the do tu dong khoi dong cung Windows^).
  echo Khong can lam gi them - cu mo lai trang Kiosk va thu lai la duoc.
  echo.
  pause
  exit /b 0
)

if not exist node_modules (
  echo [Lan dau chay] Dang cai dat thu vien...
  call npm install
)
node server.js
pause
