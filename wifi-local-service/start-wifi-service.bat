@echo off
cd /d %~dp0
echo ============================================
echo   Dich vu Wi-Fi cuc bo cho Kiosk (localhost:5000)
echo ============================================
if not exist node_modules (
  echo [Lan dau chay] Dang cai dat thu vien...
  call npm install
)
node server.js
pause
