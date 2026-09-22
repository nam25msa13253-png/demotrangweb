// Kiem tra toan ven noi dung huong dan Wi-Fi + nop ho so truc tuyen (src/data/wifiGuide.js,
// src/data/dvcGuide.js) va viec chatbot rule-based nhan dien dung y dinh. Yeu cau cot loi cua
// nguoi dat hang: MOI muc phai co nguon (URL) de can bo doi chieu, muc chua xac thuc phai duoc
// danh dau ro - test nay chan viec them noi dung "khong nguon" ma van ghi la da xac thuc.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const dvc = require('../src/data/dvcGuide');
const wifi = require('../src/data/wifiGuide');

const STATUSES = ['VERIFIED', 'PARTIAL', 'UNVERIFIED'];

function checkItem(item, sources, where) {
  assert.ok(STATUSES.includes(item.status), `${where}: status khong hop le`);
  for (const k of item.sources || []) assert.ok(sources[k], `${where}: nguon ${k} khong ton tai trong SOURCES`);
  if (item.status === 'VERIFIED') assert.ok((item.sources || []).length > 0, `${where}: da danh dau VERIFIED nhung khong co nguon`);
  if (item.status === 'PARTIAL') assert.ok(item.note || (item.details && item.details.length) || item.advice, `${where}: PARTIAL phai giai thich phan nao chua chac`);
}

test('dvcGuide: moi nguon co URL https hop le va ngay doc', () => {
  for (const [key, s] of Object.entries(dvc.SOURCES)) {
    assert.match(s.url, /^https:\/\//, key);
    assert.ok(s.title && s.accessed, key);
  }
  // Nguon do nguoi dung cung cap phai co mat nguyen ven
  assert.match(dvc.SOURCES.S1.url, /ttpvhcc\.hanoi\.gov\.vn\/video\/huong-dan-cong-dan-nop-ho-so-truc-tuyen/);
});

test('dvcGuide: cac buoc/dieu kien/loi thuong gap deu co nguon hop le va muc xac thuc nhat quan', () => {
  dvc.PREREQUISITES.forEach((p, i) => checkItem(p, dvc.SOURCES, `PREREQUISITES[${i}]`));
  dvc.STEPS.forEach((s, i) => { checkItem(s, dvc.SOURCES, `STEPS[${i}]`); assert.equal(s.no, i + 1); assert.ok(s.simple); });
  dvc.COMMON_PROBLEMS.forEach((p, i) => checkItem(p, dvc.SOURCES, `COMMON_PROBLEMS[${i}]`));
});

test('dvcGuide: du cac phan yeu cau (dang nhap VNeID, tim thu tuc, tai giay to, thanh toan, theo doi, nhan ket qua) va co muc chua xac thuc', () => {
  const titles = dvc.STEPS.map((s) => `${s.title} ${s.simple}`).join(' ').toLowerCase();
  for (const kw of ['vneid', 'tìm', 'tải', 'thanh toán', 'theo dõi', 'kết quả', 'mã hồ sơ']) assert.ok(titles.includes(kw), `thieu noi dung: ${kw}`);
  assert.ok(dvc.UNVERIFIED_TOPICS.length >= 5);
  assert.ok(dvc.COMMON_PROBLEMS.some((p) => p.status === 'UNVERIFIED'), 'phai co loi chua xac thuc duoc ghi nhan ro');
  assert.ok(dvc.CHATBOT_SHORT_STEPS.length === dvc.STEPS.length);
});

test('dvcGuide: tong dai co ghi nhan 2 nguon khac nhau la PARTIAL (khong tu chon 1 so)', () => {
  assert.equal(dvc.SUPPORT.status, 'PARTIAL');
  assert.notEqual(dvc.SUPPORT.phone, dvc.SUPPORT.altPhoneFromOtherSource);
});

test('wifiGuide: moi buoc co bieu tuong + nguon hop le; ba nhom Android/iPhone/nhap tay day du', () => {
  const groups = [wifi.GUIDE.android, wifi.GUIDE.iphone, wifi.GUIDE.manualAndroid, wifi.GUIDE.manualIphone];
  for (const g of groups) {
    assert.ok(g.steps.length >= 3, g.id);
    g.steps.forEach((s, i) => { assert.ok(s.icon && s.text, `${g.id}[${i}]`); checkItem(s, wifi.SOURCES, `${g.id}[${i}]`); });
  }
  assert.ok(wifi.GUIDE.android.ifNotWork && wifi.GUIDE.iphone.ifNotWork, 'phai co phuong an du phong khi khong quet duoc');
  assert.ok(wifi.GUIDE.stillStuck.includes('nhân viên'));
});

test('wifiGuide: cau chu cho nguoi lon tuoi - moi buoc ngan (<= 190 ky tu) va toChatText khong lo mat khau khi khong truyen mang', () => {
  for (const g of [wifi.GUIDE.android, wifi.GUIDE.iphone, wifi.GUIDE.manualAndroid, wifi.GUIDE.manualIphone]) {
    g.steps.forEach((s) => assert.ok(s.text.length <= 190, `qua dai: ${s.text}`));
  }
  const text = wifi.toChatText(wifi.GUIDE.manualAndroid, null);
  assert.ok(!text.includes('{'), 'con placeholder chua thay');
  assert.match(text, /khung Wi-Fi bên dưới/);
  const withNet = wifi.toChatText(wifi.GUIDE.manualAndroid, { ssid: 'ABC', password: 'xyz' });
  assert.match(withNet, /“ABC”/);
});

test('wifiGuide: buoc iPhone quet QR duoc danh dau CHUA xac thuc (nguon Apple khong neu ro)', () => {
  const step = wifi.GUIDE.iphone.steps[2];
  assert.equal(step.status, 'UNVERIFIED');
  assert.ok(step.note);
});

beforeEach(() => {
  db.pool.query = async (sql) => { throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`); };
  delete require.cache[require.resolve('../src/services/ruleBasedAssistant')];
});

test('chatbot rule-based: nhan dien dung y dinh Wi-Fi Android / iPhone / nhap tay / chung (khong cham DB)', async () => {
  const { tryAnswer } = require('../src/services/ruleBasedAssistant');
  assert.match(await tryAnswer('Wi-Fi Android'), /Android/);
  assert.match(await tryAnswer('wifi cho iphone thế nào'), /iPhone/);
  assert.match(await tryAnswer('Wi-Fi: điện thoại không quét được'), /Nhập tay trên Android/);
  assert.match(await tryAnswer('máy cũ không quét được mã QR wifi'), /Nhập tay trên iPhone/);
  assert.match(await tryAnswer('Kết nối Wi-Fi'), /Máy ảnh/);
  assert.match(await tryAnswer('Kết nối Wi-Fi'), /ket-noi-wifi\.html/);
});

test('chatbot rule-based: cau hoi Wi-Fi co "ma QR/quet ma" khong bi keo sang luong Re-entry', async () => {
  const { tryAnswer } = require('../src/services/ruleBasedAssistant');
  const reply = await tryAnswer('không quét được mã QR của wifi');
  assert.ok(!/Re-entry/.test(reply));
});

test('chatbot rule-based: nop ho so truc tuyen -> cac buoc + canh bao chua xac thuc + lien ket trang co nguon', async () => {
  const { tryAnswer } = require('../src/services/ruleBasedAssistant');
  const reply = await tryAnswer('Tôi muốn nộp hồ sơ trực tuyến');
  assert.match(reply, /VNeID/);
  assert.match(reply, /CHƯA xác thực/);
  assert.match(reply, /nop-ho-so-truc-tuyen\.html/);
  assert.ok(!/deep-link/.test(reply), 'khong duoc con lien ket tu che');
});

test('kioskFeatureGuide.buildGuideText (ngu canh AI): co danh sach chua xac thuc, KHONG chua mat khau Wi-Fi', () => {
  const text = require('../src/services/kioskFeatureGuide').buildGuideText();
  assert.match(text, /CHƯA XÁC THỰC/);
  assert.match(text, /Định dạng tệp/);
  assert.ok(!text.includes('hanhchinh2026'));
});
