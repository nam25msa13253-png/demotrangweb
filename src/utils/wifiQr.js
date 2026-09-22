// Tao chuoi ma QR dang nhap Wi-Fi theo dinh dang chuan "WIFI:T:<loai>;S:<ssid>;P:<mat khau>;;"
// (dinh dang ZXing, Android va iOS 11+ deu doc duoc khi quet - nguon:
//  https://github.com/zxing/zxing/wiki/Barcode-Contents , doc ngay 20/09/2026).
// Ky tu dac biet \ ; , : " trong SSID/mat khau phai escape bang dau gach cheo nguoc.
//
// LUU Y: file nay co ban sao doc lap trong wifi-local-service/wifiParse.js (dich vu do la 1
// package rieng chay tren may Kiosk, khong require duoc code cua server chinh) - sua 1 noi thi
// phai sua noi kia. test/wifiQr.test.js kiem tra ca 2 ban cho ra ket qua giong nhau.

const VALID_SECURITY = ['WPA', 'WEP', 'nopass'];

function escapeWifiField(value) {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

// security: 'WPA' (gom WPA/WPA2/WPA3 ca nhan), 'WEP' hoac 'nopass' (mang mo). Mang co kieu
// WPA/WEP nhung mat khau rong -> coi la mang mo (khong the tao ma co mat khau).
function buildWifiPayload({ ssid, password, security = 'WPA', hidden = false }) {
  if (!ssid) throw new Error('Thieu ten mang Wi-Fi (SSID).');
  const type = VALID_SECURITY.includes(security) ? security : 'WPA';
  const hiddenPart = hidden ? 'H:true;' : '';
  if (type === 'nopass' || !password) return `WIFI:T:nopass;S:${escapeWifiField(ssid)};${hiddenPart};`;
  return `WIFI:T:${type};S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};${hiddenPart};`;
}

module.exports = { buildWifiPayload, escapeWifiField, VALID_SECURITY };
