// Kiem tra tinh toan ven cua noi dung huong dan dien giay to (src/data/formGuides.js) va cac ham
// thuan moi them (uoc tinh thoi gian cho, gio Viet Nam cua EOD purge) - khong can DB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { GENERAL_RULES, DOC_HINTS, FORM_GUIDES } = require('../src/data/formGuides');
const { estimateWaitMinutes, toPublicTracking } = require('../src/services/ticketTracking');
const { getVietnamClock } = require('../src/services/purgeScheduler');

// Nguon du lieu thu tuc: seed trong db/schema.sql (cac thu tuc con lai duoc migration them).
const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

test('FORM_GUIDES: ma to khai va ma thu tuc khong trung, ma to khai vua cot VARCHAR(30)', () => {
  const formCodes = FORM_GUIDES.map((g) => g.formCode);
  const serviceCodes = FORM_GUIDES.map((g) => g.serviceCode);
  assert.equal(new Set(formCodes).size, formCodes.length);
  assert.equal(new Set(serviceCodes).size, serviceCodes.length);
  formCodes.forEach((c) => assert.ok(c.length <= 30, c));
});

test('FORM_GUIDES: moi thu tuc ton tai trong seed va docCode la 1 giay to bat buoc cua thu tuc do', () => {
  for (const g of FORM_GUIDES) {
    const line = seedSql.split('\n').find((l) => l.includes(`'${g.serviceCode}'`) && l.includes('"code"'));
    assert.ok(line, `Khong tim thay thu tuc ${g.serviceCode} trong db/schema.sql`);
    assert.ok(line.includes(`"code":"${g.docCode}"`), `${g.serviceCode}: docCode ${g.docCode} khong nam trong required_docs`);
  }
});

test('FORM_GUIDES: moi to khai co du noi dung (intro, >= 4 o, moi o co nhan + cach dien, loi thuong gap, buoc sau khi dien)', () => {
  for (const g of FORM_GUIDES) {
    assert.ok(g.intro && g.intro.length > 20, g.formCode);
    assert.ok(g.fields.length >= 4, g.formCode);
    g.fields.forEach((fld) => { assert.ok(fld.label && fld.how, `${g.formCode}: o thieu nhan/cach dien`); });
    assert.ok(g.mistakes.length >= 2, g.formCode);
    assert.ok(g.after.length >= 2, g.formCode);
  }
});

test('DOC_HINTS / GENERAL_RULES: khong co muc rong', () => {
  Object.values(DOC_HINTS).forEach((h) => assert.ok(h.length > 20));
  assert.ok(GENERAL_RULES.length >= 5);
  GENERAL_RULES.forEach((r) => assert.ok(r.title && r.text && r.icon));
});

test('estimateWaitMinutes: khong ai phia truoc -> 0; dung trung binh thuc te; fallback SLA', () => {
  assert.equal(estimateWaitMinutes({ aheadCount: 0, activeCount: 0, avgSeconds: null, slaMinutes: 15 }), 0);
  assert.equal(estimateWaitMinutes({ aheadCount: 3, activeCount: 1, avgSeconds: 300, slaMinutes: 15 }), 20);
  assert.equal(estimateWaitMinutes({ aheadCount: 2, activeCount: 0, avgSeconds: null, slaMinutes: 10 }), 20);
  // Nguoi dang duoc phuc vu (chua ai cho) van tinh 1 luot
  assert.equal(estimateWaitMinutes({ aheadCount: 0, activeCount: 1, avgSeconds: 240, slaMinutes: 10 }), 4);
  // Trung binh qua nho khong cho ra uoc tinh 0 phut khi con nguoi phia truoc
  assert.equal(estimateWaitMinutes({ aheadCount: 1, activeCount: 0, avgSeconds: 5, slaMinutes: 10 }), 1);
});

test('toPublicTracking: ve khong cho (dang goi/da xong) khong co so nguoi cho; khong lo truong rieng tu', () => {
  const t = toPublicTracking({
    ticket_number: 'A-101', status: 'CALLING', is_priority: 1, counter_name: 'Q1', service_name: 'S',
    sla_minutes: 10, aheadCount: 0, activeCount: 0, avgSeconds: null, citizen_name: 'X', phone: '1'
  });
  assert.equal(t.aheadCount, null);
  assert.equal(t.estimatedWaitMinutes, null);
  assert.equal(t.isPriority, true);
  assert.deepEqual(Object.keys(t).sort(),
    ['aheadCount', 'counterName', 'estimatedWaitMinutes', 'isPriority', 'serviceName', 'status', 'ticketNumber']);
});

test('getVietnamClock: doi dung sang gio Viet Nam (UTC+7) ke ca khi qua nua dem', () => {
  // 10:00 UTC = 17:00 gio VN (gio dong cua) - truoc day getHours() tren Render (UTC) tra 10.
  assert.deepEqual(getVietnamClock(new Date('2026-09-20T10:00:00Z')), { hour: 17, dateKey: '2026-09-20' });
  // 18:30 UTC ngay 20 = 01:30 ngay 21 gio VN
  assert.deepEqual(getVietnamClock(new Date('2026-09-20T18:30:00Z')), { hour: 1, dateKey: '2026-09-21' });
  assert.equal(getVietnamClock(new Date('2026-09-20T17:00:00Z')).hour, 0); // 00:00 VN, khong phai 24
});
