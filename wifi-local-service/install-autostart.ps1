# Cai dat Dich vu Wi-Fi cuc bo de TU DONG chay ngam moi lan dang nhap Windows - sau khi chay
# script nay 1 lan, khong can bam start-wifi-service.bat thu cong nua o nhung lan sau (ke ca
# sau khi khoi dong lai may Kiosk). Tao 1 shortcut trong thu muc Startup cua Windows tro toi
# run-hidden.vbs (chay node server.js an, khong hien cua so console).
$ErrorActionPreference = 'Stop'
$serviceDir = $PSScriptRoot

if (-not (Test-Path (Join-Path $serviceDir 'node_modules'))) {
  Write-Host "[Lan dau] Dang cai dat thu vien..."
  Push-Location $serviceDir
  npm install
  Pop-Location
}

$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'KioskWifiService.lnk'
$vbsPath = Join-Path $serviceDir 'run-hidden.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscriptPath
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $serviceDir
$shortcut.Description = 'Dich vu Wi-Fi cuc bo cho Kiosk (tu dong chay khi dang nhap)'
$shortcut.Save()

Write-Host ""
Write-Host "Da cai dat thanh cong!"
Write-Host "Tu lan dang nhap Windows tiep theo, dich vu se tu dong chay ngam - khong can bam"
Write-Host "start-wifi-service.bat nua."
Write-Host ""
Write-Host "Dang khoi dong dich vu ngay bay gio de kiem tra..."
Start-Process -FilePath $wscriptPath -ArgumentList "`"$vbsPath`""
Write-Host "Xong. Mo lai trang Kiosk va thu hoi Wi-Fi trong chatbot de kiem tra."
