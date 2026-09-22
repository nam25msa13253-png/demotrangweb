// Ham thuan (khong chay lenh, khong phu thuoc thu vien) cua Dich vu Wi-Fi cuc bo: phan loai kieu
// bao mat tu ket qua `netsh` va dung chuoi ma QR Wi-Fi. Tach khoi server.js de test duoc
// (test/wifiQr.test.js o goc du an) ma khong can may Windows/Wi-Fi that.
//
// Dinh dang QR: WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<mat khau>;; (ZXing - Android va iOS 11+ doc duoc,
// nguon https://github.com/zxing/zxing/wiki/Barcode-Contents ). Ban sao logic cua
// src/utils/wifiQr.js o server chinh - sua 1 noi phai sua noi kia.

function escapeWifiField(value) {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

// Doi gia tri dong "Authentication" cua netsh (VD "WPA2-Personal", "WPA3-Personal", "Open",
// "WPA2-Enterprise", "Open"...) thanh kieu dung cho ma QR:
//   'WPA'        - WPA / WPA2 / WPA3 ca nhan (mat khau) -> T:WPA
//   'WEP'        - WEP                                     -> T:WEP
//   'nopass'     - mang mo                                  -> T:nopass
//   'ENTERPRISE' - WPA/WPA2-Enterprise (tai khoan + may chu RADIUS): QR mat khau KHONG dung duoc
//   null         - khong nhan ra (de goi phai tu quyet dinh)
// Luu y chua xac thuc tren thiet bi that: mang CHI WPA3 (SAE) - ma T:WPA co the khong duoc mot so
// dien thoai chap nhan; mang hon hop WPA2/WPA3 (pho bien nhat) thi dung binh thuong.
function classifyAuthentication(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/enterprise|802\.1x|eap/.test(t)) return 'ENTERPRISE';
  if (/wep/.test(t)) return 'WEP';
  if (/\bopen\b/.test(t) || /^\s*mở/.test(t)) return 'nopass';
  if (/wpa/.test(t)) return 'WPA';
  return null;
}

// Tra ve { qrString, security, qrSupported }. Khong bao gio nem loi vi thieu mat khau: mang co
// bao mat nhung khong doc duoc mat khau se tra qrString = null (khong tao ma sai lam mang mo).
function buildQr({ ssid, password, authentication }) {
  const security = classifyAuthentication(authentication) || (password ? 'WPA' : 'nopass');

  if (security === 'ENTERPRISE') return { qrString: null, security, qrSupported: false };
  if (security === 'nopass') {
    return { qrString: `WIFI:T:nopass;S:${escapeWifiField(ssid)};;`, security, qrSupported: true };
  }
  if (!password) return { qrString: null, security, qrSupported: false };
  return { qrString: `WIFI:T:${security};S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};;`, security, qrSupported: true };
}

module.exports = { escapeWifiField, classifyAuthentication, buildQr };
