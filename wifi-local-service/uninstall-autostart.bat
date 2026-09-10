@echo off
echo Dang go bo tu dong khoi chay...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1"
pause
