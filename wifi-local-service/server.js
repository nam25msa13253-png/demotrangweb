// Dich vu noi bo (Local Bridge Service) - PHAI chay TREN CHINH MAY TINH KIOSK vat ly (Windows),
// KHONG lien quan gi den server chinh tren Render (Render la cloud, khong co quyen doc Wi-Fi cua
// bat ky may nao). Muc dich: doc SSID + mat khau cua mang Wi-Fi ma may Kiosk NAY dang ket noi
// (qua lenh netsh co san tren Windows), roi cho trang web Kiosk (chay ngay trong trinh duyet cua
// may nay) goi vao qua http://localhost:5000 de sinh ma QR that cho nguoi dan quet ket noi.
//
// Cach chay: xem README.md trong thu muc nay.
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

const PORT = process.env.WIFI_SERVICE_PORT || 5000;
const app = express();

// Chi cho phep trang web Kiosk that va localhost (test) goi vao.
const ALLOWED_ORIGINS = [
  'https://smart-queue-system-akpr.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // origin rong (goi truc tiep bang curl/Postman, khong phai tu trinh duyet) van cho qua de
    // tien kiem tra thu cong; trinh duyet luon gui Origin nen van duoc kiem soat dung.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Nguon goc khong duoc phep goi Dich vu Wi-Fi cuc bo.'));
  }
}));

// Private Network Access (PNA): trinh duyet (tu Chrome ~104+) coi trang HTTPS cong khai goi vao
// dia chi mang noi bo/localhost la mot loai request "public -> private" va bat buoc phai co header
// nay trong response (ca preflight OPTIONS lan response that) thi moi cho qua, neu khong request
// se bi chan am tham du CORS o tren da dung. Thieu dong nay la nguyen nhan pho bien khien tinh
// nang "goi API localhost tu 1 trang HTTPS" khong hoat dong ma khong ro ly do.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    // chcp 65001 truoc khi chay netsh de ep dau ra UTF-8, tranh SSID/ten mang co dau tieng Viet
    // bi doc sai ky tu do lech bang ma OEM mac dinh cua Command Prompt.
    exec(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout || '');
    });
  });
}

// Tim gia tri cua 1 dong dang "Nhan : Gia tri", khop voi danh sach nhan co the co (ho tro ca
// Windows tieng Anh lan tieng Viet vi nhan cua netsh phu thuoc ngon ngu he dieu hanh).
function extractByPrefix(output, prefixes) {
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    for (const prefix of prefixes) {
      if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
        const idx = line.indexOf(':');
        if (idx !== -1) return line.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

async function getConnectedSsid() {
  const output = await runCommand('netsh wlan show interfaces');

  const state = extractByPrefix(output, ['State', 'Trạng thái']);
  const isConnected = !!state && /connected|đã kết nối|da ket noi/i.test(state) && !/disconnected|ngắt|ngat/i.test(state);
  if (!isConnected) return null;

  // Chi khop dong bat dau bang "SSID" (khong phai "BSSID") - sau khi trim(), dong BSSID luon
  // bat dau bang chu "B" nen khong bi nham voi dong SSID (ten mang).
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^SSID\s*:/i.test(line)) {
      return line.slice(line.indexOf(':') + 1).trim();
    }
  }
  return null;
}

async function getSavedPassword(ssid) {
  const escapedForShell = ssid.replace(/"/g, '\\"');
  const output = await runCommand(`netsh wlan show profile name="${escapedForShell}" key=clear`);
  return extractByPrefix(output, ['Key Content', 'Nội dung khóa', 'Noi dung khoa']);
}

function escapeWifiField(value) {
  // Escape dung chuan payload QR Wi-Fi (WIFI:T:...;S:...;P:...;;)
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

app.get('/api/current-wifi', async (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ success: false, error: 'Dich vu nay chi ho tro Windows (dung lenh netsh).' });
  }

  try {
    const ssid = await getConnectedSsid();
    if (!ssid) {
      return res.json({ success: false, error: 'Máy tính này hiện không có kết nối Wi-Fi nào đang hoạt động.' });
    }

    let password = null;
    try {
      password = await getSavedPassword(ssid);
    } catch (e) {
      password = null; // Khong doc duoc profile (VD ten SSID chua ky tu la) - van tra ve SSID, coi nhu mang mo
    }

    const qrString = password
      ? `WIFI:T:WPA;S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};;`
      : `WIFI:T:nopass;S:${escapeWifiField(ssid)};;`;

    res.json({ success: true, ssid, password: password || '', qrString });
  } catch (err) {
    console.error('[wifi-local-service] Loi khi doc thong tin Wi-Fi:', err.message);
    res.status(500).json({
      success: false,
      error: 'Khong doc duoc thong tin Wi-Fi tu he dieu hanh. Kiem tra may co dang chay Windows va da bat Wi-Fi hay chua.'
    });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Chi lang nghe tren 127.0.0.1 (khong phai 0.0.0.0) - dich vu chi phuc vu trinh duyet dang mo
// TREN CHINH MAY NAY, khong can va khong nen mo ra cho cac may khac trong mang LAN goi toi.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[wifi-local-service] Dang chay tai http://localhost:${PORT}/api/current-wifi`);
});
