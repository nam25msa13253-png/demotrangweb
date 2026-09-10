@echo off
echo ============================================
echo   Cai dat: Dich vu Wi-Fi tu dong chay khi dang nhap Windows
echo   (Chi can bam file nay 1 LAN DUY NHAT)
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
pause
