// Kiem tra tao chuoi ma QR Wi-Fi (WIFI:T:...;S:...;P:...;;) o CA 2 noi: server chinh
// (src/utils/wifiQr.js) va Dich vu Wi-Fi cuc bo tren may Kiosk (wifi-local-service/wifiParse.js).
// Khong can may Windows/Wi-Fi that.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildWifiPayload } = require('../src/utils/wifiQr');
const { buildQr, classifyAuthentication, escapeWifiField } = require('../wifi-local-service/wifiParse');

test('buildWifiPayload: dung dinh dang chuan cho mang WPA', () => {
  assert.equal(buildWifiPayload({ ssid: 'MOTCUA-FREE-WIFI', password: 'hanhchinh2026', security: 'WPA' }),
    'WIFI:T:WPA;S:MOTCUA-FREE-WIFI;P:hanhchinh2026;;');
});

test('buildWifiPayload: escape \\ ; , : " trong SSID va mat khau (vi du chinh thuc cua ZXing)', () => {
  assert.equal(buildWifiPayload({ ssid: '"foo;bar\\baz"', password: 'a,b:c', security: 'WPA' }),
    'WIFI:T:WPA;S:\\"foo\\;bar\\\\baz\\";P:a\\,b\\:c;;');
  assert.equal(escapeWifiField('a;b'), 'a\\;b');
});

test('buildWifiPayload: mang mo / thieu mat khau -> nopass, khong co truong P; WEP giu nguyen; kieu la -> WPA', () => {
  assert.equal(buildWifiPayload({ ssid: 'Cafe', password: '', security: 'WPA' }), 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(buildWifiPayload({ ssid: 'Cafe', password: 'x', security: 'nopass' }), 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(buildWifiPayload({ ssid: 'Old', password: '12345', security: 'WEP' }), 'WIFI:T:WEP;S:Old;P:12345;;');
  assert.equal(buildWifiPayload({ ssid: 'X', password: 'p', security: 'WPA9' }), 'WIFI:T:WPA;S:X;P:p;;');
  assert.equal(buildWifiPayload({ ssid: 'H', password: 'p', security: 'WPA', hidden: true }), 'WIFI:T:WPA;S:H;P:p;H:true;;');
  assert.throws(() => buildWifiPayload({ ssid: '', password: 'p' }), /SSID/);
});

test('classifyAuthentication: doc dung nhan cua netsh (tieng Anh) ', () => {
  assert.equal(classifyAuthentication('WPA2-Personal'), 'WPA');
  assert.equal(classifyAuthentication('WPA3-Personal'), 'WPA');
  assert.equal(classifyAuthentication('WPA-Personal'), 'WPA');
  assert.equal(classifyAuthentication('Open'), 'nopass');
  assert.equal(classifyAuthentication('Mở'), 'nopass');
  assert.equal(classifyAuthentication('WEP'), 'WEP');
  assert.equal(classifyAuthentication('WPA2-Enterprise'), 'ENTERPRISE');
  assert.equal(classifyAuthentication(null), null);
  assert.equal(classifyAuthentication('gi-do-la'), null);
});

test('wifi-local-service buildQr: khop voi ban server chinh cho cac truong hop pho bien', () => {
  const cases = [
    { ssid: 'MOTCUA', password: 'abc;123', authentication: 'WPA2-Personal', security: 'WPA' },
    { ssid: 'Mo', password: '', authentication: 'Open', security: 'nopass' },
    { ssid: 'Cu', password: '12345', authentication: 'WEP', security: 'WEP' }
  ];
  for (const c of cases) {
    const local = buildQr(c);
    assert.equal(local.security, c.security);
    assert.equal(local.qrString, buildWifiPayload({ ssid: c.ssid, password: c.password, security: c.security }));
    assert.equal(local.qrSupported, true);
  }
});

test('wifi-local-service buildQr: mang doanh nghiep hoac khong doc duoc mat khau -> khong tao ma sai', () => {
  assert.deepEqual(buildQr({ ssid: 'Corp', password: 'x', authentication: 'WPA2-Enterprise' }),
    { qrString: null, security: 'ENTERPRISE', qrSupported: false });
  // Mang co bao mat WPA2 nhung khong doc duoc mat khau: KHONG duoc tao ma "mang mo" gay hieu nham
  const r = buildQr({ ssid: 'Nha', password: null, authentication: 'WPA2-Personal' });
  assert.equal(r.qrString, null);
  assert.equal(r.qrSupported, false);
  // Khong biet kieu bao mat, co mat khau -> WPA; khong mat khau -> mo
  assert.equal(buildQr({ ssid: 'A', password: 'p', authentication: null }).security, 'WPA');
  assert.equal(buildQr({ ssid: 'A', password: '', authentication: null }).security, 'nopass');
});
