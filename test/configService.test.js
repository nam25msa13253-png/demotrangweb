// Kiem tra logic Safe Limits Validation (bien do an toan) cua Dynamic Policy Engine ma
// KHONG can ket noi Postgres that: gia pool.query() bang 1 ham gia lap tra ve du lieu dung
// hinh dang { rows }, vi configService.js dung chung 1 tham chieu `pool` (module singleton)
// nen ghi de duoc property .query truoc khi goi cac ham can test.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');

const FAKE_CONFIGS = [
  { config_key: 'CALL_TIMEOUT_SECONDS', config_value: '45', value_type: 'NUMBER', min_bound: '30', max_bound: '120' },
  { config_key: 'TTS_VOICE', config_value: 'vi-VN-Standard-A', value_type: 'STRING', min_bound: null, max_bound: null }
];

let state;

beforeEach(() => {
  // Reset "DB gia" ve trang thai goc truoc moi test, va gia lap UPDATE thuc su ghi de gia
  // tri (giong hanh vi that) de configService.set() sau do loadAll() lai doc dung gia tri moi.
  state = FAKE_CONFIGS.map((r) => ({ ...r }));
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: state.map((r) => ({ ...r })) };
    if (sql.startsWith('UPDATE')) {
      const [value, , key] = params;
      const row = state.find((r) => r.config_key === key);
      if (row) row.config_value = String(value);
      return { rows: [] };
    }
    throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
  };
  delete require.cache[require.resolve('../src/config/configService')];
});

test('configService.get: doi kieu NUMBER tu chuoi luu trong DB', async () => {
  const configService = require('../src/config/configService');
  const value = await configService.get('CALL_TIMEOUT_SECONDS');
  assert.equal(value, 45);
  assert.equal(typeof value, 'number');
});

test('configService.set: tu choi gia tri nho hon bien do toi thieu (min_bound)', async () => {
  const configService = require('../src/config/configService');
  await assert.rejects(
    () => configService.set('CALL_TIMEOUT_SECONDS', '10', 'admin-id'),
    /nho hon bien do toi thieu/
  );
});

test('configService.set: tu choi gia tri vuot bien do toi da (max_bound)', async () => {
  const configService = require('../src/config/configService');
  await assert.rejects(
    () => configService.set('CALL_TIMEOUT_SECONDS', '999', 'admin-id'),
    /vuot bien do toi da/
  );
});

test('configService.set: tu choi gia tri khong phai la so cho tham so kieu NUMBER', async () => {
  const configService = require('../src/config/configService');
  await assert.rejects(
    () => configService.set('CALL_TIMEOUT_SECONDS', 'abc', 'admin-id'),
    /khong phai la so hop le/
  );
});

test('configService.set: chap nhan gia tri hop le trong bien do', async () => {
  const configService = require('../src/config/configService');
  const updated = await configService.set('CALL_TIMEOUT_SECONDS', '60', 'admin-id');
  assert.equal(updated.config_value, '60');
});

test('configService.get: nem loi ro rang khi tham so khong ton tai', async () => {
  const configService = require('../src/config/configService');
  await assert.rejects(() => configService.get('KHONG_TON_TAI'), /khong ton tai/);
});
