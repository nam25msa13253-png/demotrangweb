// Kiem tra logic chan cap so ngoai gio (src/services/kioskHours.js) - ham thuan evaluate() voi
// thoi diem gia lap, khong can DB. Moc thoi gian duoc dat theo UTC (gio VN = UTC + 7).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const kioskHours = require('../src/services/kioskHours');
const configService = require('../src/config/configService');

const CFG = { enforced: true, openTime: '07:30', closeTime: '17:00', workingDays: '1,2,3,4,5' };
// 2026-09-21 la Thu Hai; 2026-09-20 la Chu nhat; 2026-09-25 la Thu Sau.
const at = (isoUtc) => new Date(isoUtc);

test('evaluate: trong gio lam viec (10:00 VN Thu Hai) -> mo cua', () => {
  const r = kioskHours.evaluate(CFG, at('2026-09-21T03:00:00Z'));
  assert.equal(r.open, true);
  assert.equal(r.message, null);
});

test('evaluate: dung 17:00 VN la da dong (khong con cap so), 16:59 con mo', () => {
  assert.equal(kioskHours.evaluate(CFG, at('2026-09-21T09:59:00Z')).open, true);
  assert.equal(kioskHours.evaluate(CFG, at('2026-09-21T10:00:00Z')).open, false);
});

test('evaluate: sau gio dong Thu Hai -> bao mo lai NGAY MAI kem thu/ngay/gio', () => {
  const r = kioskHours.evaluate(CFG, at('2026-09-21T14:00:00Z')); // 21:00 VN
  assert.equal(r.open, false);
  assert.match(r.message, /hết giờ làm việc/);
  assert.match(r.message, /ngày mai \(Thứ Ba, 22\/09\/2026\)/);
  assert.match(r.message, /07:30/);
  assert.equal(r.opensAt.date, '22/09/2026');
});

test('evaluate: truoc gio mo cua -> bao mo cua HOM NAY', () => {
  const r = kioskHours.evaluate(CFG, at('2026-09-21T22:30:00Z')); // 05:30 VN Thu Ba
  assert.equal(r.open, false);
  assert.match(r.message, /chưa mở cửa/);
  assert.match(r.message, /hôm nay/);
  assert.equal(r.opensAt.offsetDays, 0);
});

test('evaluate: Thu Sau toi -> mo lai THU HAI (bo qua cuoi tuan)', () => {
  const r = kioskHours.evaluate(CFG, at('2026-09-25T13:00:00Z')); // 20:00 VN Thu Sau
  assert.equal(r.open, false);
  assert.match(r.message, /Thứ Hai, 28\/09\/2026/);
  assert.equal(r.opensAt.offsetDays, 3);
});

test('evaluate: Chu nhat (khong lam viec) -> noi ro khong lam viec + mo lai Thu Hai', () => {
  const r = kioskHours.evaluate(CFG, at('2026-09-20T03:00:00Z'));
  assert.equal(r.open, false);
  assert.match(r.message, /không làm việc/);
  assert.match(r.message, /Thứ Hai/);
  assert.match(r.hoursText, /Thứ Hai đến Thứ Sáu/);
});

test('evaluate: cong tac tat (enforced=false) -> luon mo, ke ca 2h sang Chu nhat', () => {
  const r = kioskHours.evaluate({ ...CFG, enforced: false }, at('2026-09-19T19:00:00Z'));
  assert.equal(r.open, true);
  assert.equal(r.enforced, false);
});

test('evaluate: cau hinh hong (gio mo >= gio dong, ngay sai) -> KHONG chan', () => {
  assert.equal(kioskHours.evaluate({ ...CFG, openTime: '18:00' }, at('2026-09-21T14:00:00Z')).open, true);
  assert.equal(kioskHours.evaluate({ ...CFG, workingDays: '9,x' }, at('2026-09-21T14:00:00Z')).open, true);
  assert.equal(kioskHours.evaluate({ ...CFG, openTime: 'abc' }, at('2026-09-21T14:00:00Z')).open, true);
});

test('evaluate: lam viec ca Thu Bay -> mo lai Thu Bay, mo ta khoang ngay dung', () => {
  const r = kioskHours.evaluate({ ...CFG, workingDays: '1,2,3,4,5,6' }, at('2026-09-25T13:00:00Z'));
  assert.match(r.message, /Thứ Bảy, 26\/09\/2026/);
  assert.match(r.hoursText, /Thứ Hai đến Thứ Bảy/);
});

test('getStatus: bien moi truong KIOSK_HOURS_ENFORCED=false tham quyen cao hon cau hinh DB', async () => {
  const oldGet = configService.get;
  const oldEnv = process.env.KIOSK_HOURS_ENFORCED;
  configService.get = async (k) => ({ KIOSK_HOURS_ENFORCED: 1, KIOSK_OPEN_TIME: '07:30', KIOSK_CLOSE_TIME: '17:00', KIOSK_WORKING_DAYS: '1,2,3,4,5' }[k]);
  try {
    delete process.env.KIOSK_HOURS_ENFORCED;
    assert.equal((await kioskHours.getStatus(at('2026-09-20T03:00:00Z'))).open, false); // Chu nhat
    process.env.KIOSK_HOURS_ENFORCED = 'false';
    const r = await kioskHours.getStatus(at('2026-09-20T03:00:00Z'));
    assert.equal(r.open, true);
    assert.equal(r.disabledBy, 'env');
  } finally {
    configService.get = oldGet;
    if (oldEnv === undefined) delete process.env.KIOSK_HOURS_ENFORCED; else process.env.KIOSK_HOURS_ENFORCED = oldEnv;
  }
});

test('configService.set: chan gio sai dinh dang / gio mo >= gio dong / ngay sai / kieu Wi-Fi la', async () => {
  const db = require('../src/config/db');
  const oldQuery = db.pool.query;
  const rows = [
    { config_key: 'KIOSK_OPEN_TIME', config_value: '07:30', value_type: 'STRING' },
    { config_key: 'KIOSK_CLOSE_TIME', config_value: '17:00', value_type: 'STRING' },
    { config_key: 'KIOSK_WORKING_DAYS', config_value: '1,2,3,4,5', value_type: 'STRING' },
    { config_key: 'WIFI_SECURITY', config_value: 'WPA', value_type: 'STRING' }
  ];
  db.pool.query = async (sql) => (sql.includes('SELECT * FROM system_configs') ? { rows } : { rows: [] });
  delete require.cache[require.resolve('../src/config/configService')];
  const cs = require('../src/config/configService');
  try {
    await assert.rejects(() => cs.set('KIOSK_OPEN_TIME', '25:99'), /HH:MM/);
    await assert.rejects(() => cs.set('KIOSK_OPEN_TIME', '17:30'), /som hon/);
    await assert.rejects(() => cs.set('KIOSK_CLOSE_TIME', '07:00'), /muon hon/);
    await assert.rejects(() => cs.set('KIOSK_WORKING_DAYS', '1,8'), /1 \(Thu Hai\)/);
    await assert.rejects(() => cs.set('WIFI_SECURITY', 'WPA9'), /WPA, WEP/);
    await cs.set('KIOSK_OPEN_TIME', '08:00');
    await cs.set('KIOSK_WORKING_DAYS', '1,2,3,4,5,6');
  } finally {
    db.pool.query = oldQuery;
    delete require.cache[require.resolve('../src/config/configService')];
  }
});
