// Kiem tra bo tra loi Rule-based (khong goi Gemini API) - gia lap pool.query nhu
// configService.test.js de khong can Postgres that.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');

const FAKE_SERVICES = [
  {
    id: 1, name: 'Đăng ký khai sinh', short_alias: 'khai sinh', field_name: 'Hộ tịch - Tư pháp',
    sla_minutes: 15, fee_amount: 0,
    required_docs: [{ code: 'CMND', name: 'CCCD/CMND bản chính', mandatory: true }]
  },
  {
    id: 2, name: 'Sang tên Giấy chứng nhận Quyền sử dụng đất', short_alias: 'sang tên sổ đỏ',
    field_name: 'Đất đai - Tài nguyên', sla_minutes: 30, fee_amount: 500000,
    required_docs: [{ code: 'CCCD', name: 'CCCD hai bên', mandatory: true }]
  }
];

const FAKE_COUNTERS = [
  { code: 'QUAY-01', status: 'OPEN', field_name: 'Hộ tịch - Tư pháp', waiting_count: 3 },
  { code: 'QUAY-03', status: 'CLOSED', field_name: 'Đất đai - Tài nguyên', waiting_count: 0 }
];

beforeEach(() => {
  db.pool.query = async (sql) => {
    if (sql.includes('FROM services')) return { rows: FAKE_SERVICES.map((s) => ({ ...s })) };
    if (sql.includes('FROM counters')) return { rows: FAKE_COUNTERS.map((c) => ({ ...c })) };
    throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
  };
  delete require.cache[require.resolve('../src/services/ruleBasedAssistant')];
});

test('tryAnswer: nhan dien loi chao hoi', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('Xin chào');
  assert.match(reply, /Trung tâm Hành chính công/);
});

test('tryAnswer: khop dung thu tuc theo bi danh, khong dau khong phan biet hoa thuong', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('LAM GIAY Khai Sinh can gi?');
  assert.match(reply, /Đăng ký khai sinh/);
  assert.match(reply, /CCCD\/CMND bản chính/);
  assert.match(reply, /Lệ phí: 0đ/);
});

test('tryAnswer: khop dung thu tuc co gia tri (khong nham lan giua 2 thu tuc)', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('Lệ phí sang tên sổ đỏ bao nhiêu?');
  assert.match(reply, /Sang tên Giấy chứng nhận Quyền sử dụng đất/);
  assert.match(reply, /500\.000đ/);
});

test('tryAnswer: nhan dien cau hoi ve tinh trang quay', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('Quầy nào đang mở?');
  assert.match(reply, /QUAY-01/);
  assert.match(reply, /đang mở/);
});

test('tryAnswer: nhan dien cau hoi ve tinh nang Wi-Fi cua Kiosk', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('Hướng dẫn tôi kết nối Wi-Fi.');
  assert.match(reply, /Kết nối Wi-Fi/);
});

test('tryAnswer: tra ve null khi khong nhan dien duoc mau nao (de fallback sang AI)', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  const reply = await ruleBasedAssistant.tryAnswer('Ông trời hôm nay có nắng không nhỉ?');
  assert.equal(reply, null);
});

test('tryAnswer: chuoi rong tra ve null', async () => {
  const ruleBasedAssistant = require('../src/services/ruleBasedAssistant');
  assert.equal(await ruleBasedAssistant.tryAnswer(''), null);
  assert.equal(await ruleBasedAssistant.tryAnswer('   '), null);
});
