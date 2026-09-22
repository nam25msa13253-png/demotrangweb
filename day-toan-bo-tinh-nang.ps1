# =====================================================================================
# VIEC B - Dua TOAN BO tinh nang moi len GitHub (Render se tu deploy lai).
#
# CACH CHAY - mo PowerShell tai thu muc du an roi go:
#     .\day-toan-bo-tinh-nang.ps1
#
# KHAC voi cap-nhat-github.ps1 (chi day 7 file co so du lieu): script nay dung `git add -A`
# de dua len TAT CA thay doi, ke ca cac file chua bao gio duoc commit. Bat buoc phai lam
# vay: thieu du chi mot thu muc src/data/ la Render chet ngay khi khoi dong voi loi
# MODULE_NOT_FOUND, vi src/migrations/runMigrations.js co require('../data/formGuides').
#
# Nhung gi da duoc kiem chung truoc khi viet script nay (tren PostgreSQL 18 sach):
#   - 57 file JS phia may chu: moi require() cuc bo deu tro toi file co that
#   - 12 trang HTML: moi <script src> va <link href> deu tro toi file co that
#   - Khong file bat buoc nao bi .gitignore loai bo (.gitignore chi co node_modules, .env, *.log)
#   - Khong co API key / mat khau / chuoi ket noi nao bi ghi cung trong ma nguon
#   - 155/155 test dat
#   - Luong day du chay thong: lay so A-101 -> goi so -> tiep nhan -> hoan tat -> len bao cao KPI
#   - 11 trang va 12 API deu tra ve HTTP 200
# =====================================================================================

Set-Location -Path $PSScriptRoot

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
# 1. Khoa cu con sot lai
# -------------------------------------------------------------------------------------
if (Test-Path '.git/index.lock') {
  $khoa = Get-Item '.git/index.lock'
  $tuoiGiay = [int]((Get-Date) - $khoa.LastWriteTime).TotalSeconds
  Write-Host ''
  Write-Host 'Phat hien khoa cu: .git/index.lock' -ForegroundColor Yellow
  Write-Host "  Kich thuoc: $($khoa.Length) byte | Tao cach day: $tuoiGiay giay" -ForegroundColor Yellow
  Write-Host '  Truoc khi dong y: dong het cua so git/VS Code dang thao tac tren repo nay.' -ForegroundColor Yellow
  if ((Read-Host 'Xoa khoa nay de tiep tuc? (y/n)') -ne 'y') { Write-Host 'Da dung.' -ForegroundColor Yellow; exit 0 }
  Remove-Item '.git/index.lock' -Force
  Write-Host 'Da xoa khoa.' -ForegroundColor Green
}

# -------------------------------------------------------------------------------------
# 2. CHOT AN TOAN 1: .env chua mat khau CSDL va API key - khong duoc len GitHub
# -------------------------------------------------------------------------------------
Tieu-De 'Kiem tra an toan'

$envTracked = (git ls-files .env) | Out-String
if ($envTracked.Trim() -ne '') {
  Write-Host 'File .env dang bi git theo doi - no chua mat khau database!' -ForegroundColor Red
  Write-Host '    git rm --cached .env' -ForegroundColor Yellow
  exit 1
}
Write-Host '  .env khong bi git theo doi - an toan' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 3. Kiem tra cac file BAT BUOC phai co (thieu la Render chet khi khoi dong)
# -------------------------------------------------------------------------------------
$BAT_BUOC = @(
  'src/data/formGuides.js', 'src/data/dvcGuide.js', 'src/data/wifiGuide.js',
  'src/services/kioskHours.js', 'src/services/ticketTracking.js', 'src/utils/wifiQr.js',
  'public/js/theo-doi.js', 'public/js/form-guide.js', 'public/js/qrLoader.js',
  'public/js/ket-noi-wifi.js', 'public/js/nop-ho-so-truc-tuyen.js',
  'public/css/form-guide.css', 'public/css/guide-pages.css',
  'public/theo-doi.html', 'public/ket-noi-wifi.html',
  'public/nop-ho-so-truc-tuyen.html', 'public/huong-dan-dien-mau.html'
)
$thieu = $BAT_BUOC | Where-Object { -not (Test-Path $_) }
if ($thieu) {
  Write-Host 'Thieu cac file bat buoc sau - deploy se hong:' -ForegroundColor Red
  $thieu | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  exit 1
}
Write-Host "  Du $($BAT_BUOC.Count) file bat buoc" -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 4. Bo test
# -------------------------------------------------------------------------------------
Tieu-De 'Chay bo test du an (khoang 40 giay)'

$ketQuaTest = & node --test 2>&1
$maThoatTest = $LASTEXITCODE
$ketQuaTest | Select-String -Pattern '^# (tests|pass|fail)' | ForEach-Object {
  Write-Host "  $_" -ForegroundColor Gray
}
if ($maThoatTest -ne 0) { Dung-Lai 'Co test that bai. Khong dua code hong len he thong that.' }
Write-Host '  Tat ca test deu dat' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 5. Dua TAT CA vao vung chuan bi commit
# -------------------------------------------------------------------------------------
Tieu-De 'Nhung thay doi sap dua len'

git add -A
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Khong dua duoc file vao vung chuan bi commit.' }

$danhSach = git diff --cached --name-only
$soFile = ($danhSach | Measure-Object).Count
Write-Host "  Tong cong $soFile file" -ForegroundColor Gray
git diff --cached --stat | Select-Object -Last 1

# CHOT AN TOAN 2: .env tuyet doi khong duoc nam trong danh sach commit
if (($danhSach | Out-String) -match '(^|\r?\n)\.env(\r?\n|$)') {
  git reset | Out-Null
  Dung-Lai 'Phat hien .env trong danh sach commit. Da huy toan bo.'
}
Write-Host '  Da kiem tra lai: .env khong nam trong danh sach commit' -ForegroundColor Green

Write-Host ''
Write-Host 'Danh sach day du cac file se duoc dua len:' -ForegroundColor Gray
$danhSach | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

$traLoi = Read-Host "`nDong y commit $soFile file tren? (y/n)"
if ($traLoi -ne 'y') {
  git reset | Out-Null
  Write-Host 'Da huy, khong thay doi gi.' -ForegroundColor Yellow
  exit 0
}

git commit -m "Bo sung tinh nang cong dan: tra cuu ve, huong dan dien to khai, Wi-Fi QR, huong dan DVC, gio mo cua Kiosk"
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Commit that bai.' }
Write-Host 'Da commit vao may.' -ForegroundColor Green

# -------------------------------------------------------------------------------------
# 6. Push - kich hoat deploy that
# -------------------------------------------------------------------------------------
Tieu-De 'Day len GitHub'
Write-Host 'Day la dot deploy LON: production dang chay bo tinh nang cu, sau buoc nay se' -ForegroundColor Yellow
Write-Host 'nhay thang len ban moi nhat. Render bat autoDeploy nen se tu trien khai ngay.' -ForegroundColor Yellow
Write-Host 'Neu co su co, quay lui bang: git revert HEAD  roi  git push' -ForegroundColor Yellow

if ((Read-Host "`nDay len GitHub va deploy ngay bay gio? (y/n)") -ne 'y') {
  Write-Host 'Da commit nhung chua push. Khi nao san sang thi go: git push' -ForegroundColor Yellow
  exit 0
}

git push
if ($LASTEXITCODE -ne 0) { Dung-Lai 'Push that bai. Commit van con nguyen tren may, go `git push` de thu lai.' }

Write-Host ''
Write-Host 'Xong. Mo Render Dashboard -> tab Logs de theo doi.' -ForegroundColor Green
Write-Host 'Deploy thanh cong se thay dong: Your service is live' -ForegroundColor Green
Write-Host ''
Write-Host 'Sau do kiem tra cac trang MOI tren dia chi that:' -ForegroundColor Cyan
Write-Host '  /theo-doi.html              - tra cuu ve' -ForegroundColor Cyan
Write-Host '  /huong-dan-dien-mau.html    - huong dan dien to khai' -ForegroundColor Cyan
Write-Host '  /ket-noi-wifi.html          - ket noi Wi-Fi bang ma QR' -ForegroundColor Cyan
Write-Host '  /nop-ho-so-truc-tuyen.html  - huong dan nop ho so truc tuyen' -ForegroundColor Cyan
