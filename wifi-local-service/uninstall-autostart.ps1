# Go bo tu dong khoi chay da cai qua install-autostart.ps1 (khong xoa code, chi xoa shortcut
# trong thu muc Startup cua Windows - dich vu se khong con tu chay khi dang nhap nua).
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'KioskWifiService.lnk'

if (Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
  Write-Host "Da go tu dong khoi chay. Dich vu se khong con tu chay khi dang nhap Windows nua."
} else {
  Write-Host "Khong tim thay muc tu dong khoi chay nao (co the chua cai dat truoc do)."
}
