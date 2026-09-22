# =====================================================================================
# Dua phan nang cap co so du lieu len GitHub (Render se tu deploy lai sau khi push).
#
# CACH CHAY - mo PowerShell tai thu muc du an roi go:
#     .\cap-nhat-github.ps1
#
# Script chi dua len 7 muc lien quan toi co so du lieu. Cac file khac ban dang sua do
# (public/, docs/, css...) KHONG bi dung toi - ban tu commit rieng khi nao san sang.
# Script se dung lai hoi y kien truoc khi commit va truoc khi push.
#
# GHI CHU KY THUAT: KHONG dat $ErrorActionPreference = 'Stop' o day. Nhieu lenh git ghi
# thong tin binh thuong ra luong loi (stderr) - VD `git push` in tien do, `git ls-files
# --error-unmatch` bao loi khi file khong duoc theo doi (day lai la ket qua TOT). Voi
# 'Stop', PowerShell bien nhung dong do thanh loi nghiem trong va dung ca script giua
# chung. Thay vao do, sau moi lenh git ta tu kiem tra ma thoat $LASTEXITCODE.
# =====================================================================================

Set-Location -Path $PSScriptRoot

$FILES = @(
  'db/schema.sql',
  'db/migrations/001_upgrade.sql',
  'db/init.js',
  'src/config/db.js',
  'render.yaml',
  '.env.example',
  'README.md'
)

function Tieu-De($text) {
  Write-Host ''
  Write-Host "=== $text ===" -ForegroundColor Cyan
}
function Dung-Lai($text) {
  Write-Host ''
  Write-Host "DUNG LAI: $text" -ForegroundColor Red
  exit 1
}

# -------------------------------------------------------------------------------------
# 1. Don file rac neu con sot
# -------------------------------------------------------------------------------------
if (Test-Path '.git/__probe') {
  Remove-Item '.git/__probe' -Force -ErrorAction SilentlyContinue
  Write-Host 'Da xoa file rac .git/__probe' -ForegroundColor DarkGray
}

# Khoa cu con sot lai (index.lock). Git tao file nay khi ghi vao repo va xoa ngay sau do.
# Neu no con nam lai nghia la mot tien trinh git truoc day chet giua chung - moi thao tac
# ghi cua git se bi chan cho toi khi xoa no.
# KHONG tu dong xoa: neu that su con git dang chay (VD ban dang mo cua so 'git commit'
# khac, hoac VS Code dang dong bo), xoa khoa se lam hong vung chuan bi commit. Hoi truoc.
if (Test-Path '.git/index.lock') {
  $khoa = Get-Item '.git/index.lock'
  $tuoiGiay = [int]((Get-Date) - $khoa.LastWriteTime).TotalSeconds
  Write-Host ''
  Write-Host 'Phat hien khoa cu: .git/index.lock' -ForegroundColor Yellow
  Write-Host "  Kich thuoc: $($khoa.Length) byte | Tao cach day: $tuoiGiay giay" -ForegroundColor Yellow
  Write-Host '  Khoa rong va cu thuong la rac do mot tien trinh git chet giua chung.' -ForegroundColor Yellow
  Write-Host '  Truoc khi dong y: dong het cua so git/VS Code dang thao tac tren repo nay.' -ForegroundColor Yellow

  $traLoi = Read-Host 'Xoa khoa nay de tiep tuc? (y/n)'
  if ($traLoi -ne 'y') {
    Write-Host 'Da dung. Khong thay doi gi.' -ForegroundColor Yellow
    exit 0
  }
  Remove-Item '.git/index.lock' -Force
  Write-Host 'Da xoa khoa.' -ForegroundColor Green
}

# -------------------------------------------------------------------------------------
# 2. CHOT AN TOAN: .env chua mat khau CSDL - tuyet doi khong duoc len GitHub
#    `git ls-files .env` tra ve chuoi rong neu file KHONG duoc theo doi, va khong bao loi.
# -------------------------------------------------------------------------------------
Tieu-De 'Kiem tra an toan'

$envTracked = (git ls-files .env) | Out-String
if ($envTracked.Trim() -ne '') {
  Write-Host 'File .env dang bi git theo doi - no chua mat khau database!' -ForegroundColor Red
  Write-Host 'Chay lenh sau de go no ra khoi git roi thu lai:' -ForegroundColor Yellow
  Write-Host '    git rm --cached .env' -ForegroundColor Yellow
  exit 1
}
Write-Host '  .env khong bi git theo doi - an toan' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 3. Kiem tra 7 muc deu ton tai
# -------------------------------------------------------------------------------------
$thieu = $FILES | Where-Object { -not (Test-Path $_) }
if ($thieu) {
  Write-Host 'Khong tim thay cac file sau:' -ForegroundColor Red
  $thieu | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  exit 1
}
Write-Host "  Du $($FILES.Count) file can dua len" -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 4. Chay bo test truoc khi dua len (155 test, mat khoang 40 giay)
# -------------------------------------------------------------------------------------
Tieu-De 'Chay bo test du an (khoang 40 giay)'

$ketQuaTest = & node --test 2>&1
$maThoatTest = $LASTEXITCODE
$ketQuaTest | Select-String -Pattern '^# (tests|pass|fail)' | ForEach-Object {
  Write-Host "  $_" -ForegroundColor Gray
}
if ($maThoatTest -ne 0) {
  Dung-Lai 'Co test that bai. Khong nen dua code hong len he thong that.'
}
Write-Host '  Tat ca test deu dat' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 5. Dua vao vung chuan bi commit va cho xem lai
# -------------------------------------------------------------------------------------
Tieu-De 'Nhung thay doi sap dua len'

git add -- $FILES
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Khong dua duoc file vao vung chuan bi commit.' }

git diff --cached --stat

# Chot an toan lan hai: xac nhan .env khong lot vao vung chuan bi commit
$dangCommit = (git diff --cached --name-only) | Out-String
if ($dangCommit -match '(^|\r?\n)\.env(\r?\n|$)') {
  git reset -- $FILES | Out-Null
  Dung-Lai 'Phat hien .env trong danh sach commit. Da huy toan bo.'
}

$traLoi = Read-Host "`nDong y commit nhung thay doi tren? (y/n)"
if ($traLoi -ne 'y') {
  git reset -- $FILES | Out-Null
  Write-Host 'Da huy, khong thay doi gi.' -ForegroundColor Yellow
  exit 0
}

git commit -m "Chuyen CSDL sang Neon, nang cap schema Postgres, chong sap server khi dut ket noi"
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Commit that bai.' }
Write-Host 'Da commit vao may.' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 6. Push - buoc nay kich hoat deploy that len Render, hoi lai lan nua
# -------------------------------------------------------------------------------------
Tieu-De 'Day len GitHub'
Write-Host 'Luu y: Render bat autoDeploy nen push xong se TU DONG deploy len' -ForegroundColor Yellow
Write-Host 'https://smart-queue-system-akpr.onrender.com (he thong that dang chay).' -ForegroundColor Yellow

$traLoi = Read-Host "`nDay len GitHub va deploy ngay bay gio? (y/n)"
if ($traLoi -ne 'y') {
  Write-Host 'Da commit nhung chua push. Khi nao san sang thi go: git push' -ForegroundColor Yellow
  exit 0
}

git push
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Push that bai. Commit van con nguyen tren may, go `git push` de thu lai.' }

Write-Host ''
Write-Host 'Xong. Mo Render Dashboard -> tab Logs de theo doi deploy.' -ForegroundColor Green
Write-Host 'Deploy thanh cong se thay dong: Your service is live' -ForegroundColor Green
