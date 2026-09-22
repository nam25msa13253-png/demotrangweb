// Test tich hop qua tang HTTP that (dung supertest goi vao 1 Express app duoc dung lai trong
// test, gan cac route module that cua du an) - truoc day chi co test o tang service/logic
// thuan, chua co gi xac nhan middleware (authenticate/requirePermission) va validate.js thuc
// su hoat dong dung KHI DI QUA request/response that cua Express (headers, status code, body
// JSON...), khong chi goi thang ham JS. Van mock repository/pool.query o tang duoi cung nhu
// cac test khac trong bo - khong can Postgres that.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../src/config/db');
const serviceRepo = require('../src/repositories/serviceRepository');

let staffFixtures;
let sessionFixtures;

function resetFixtures() {
  staffFixtures = [
    { id: 'staff-officer', username: 'officer01', password_hash: bcrypt.hashSync('changeme', 4), role: 'OFFICER', full_name: 'Officer Mot', is_active: 1 },
    { id: 'staff-admin', username: 'superadmin', password_hash: bcrypt.hashSync('changeme', 4), role: 'SUPER_ADMIN', full_name: 'Super Admin', is_active: 1 }
  ];
  sessionFixtures = [];
}

// Xay 1 Express app moi cho moi test (giong het cach server.js gan route that, tru phan
// helmet/CORS/rate-limit/migration khong lien quan toi hanh vi route dang kiem tra) - route
// module duoc yeu cau lai (cache da bi xoa trong beforeEach) de doc dung ban mock moi nhat.
function buildApp() {
  const authRoutes = require('../src/routes/authRoutes');
  const adminRoutes = require('../src/routes/adminRoutes');
  const kioskRoutes = require('../src/routes/kioskRoutes');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/kiosk', kioskRoutes);
  app.use('/api/admin', adminRoutes);
  app.use((req, res) => res.status(404).json({ error: 'Khong tim thay endpoint.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: 'Loi he thong noi bo.' }));
  return app;
}

beforeEach(() => {
  resetFixtures();

  db.pool.query = async (sql, params = []) => {
    if (sql.includes('FROM staff WHERE username')) {
      const staff = staffFixtures.find((s) => s.username === params[0] && s.is_active === 1);
      return { rows: staff ? [staff] : [] };
    }
    if (sql.includes('FROM staff WHERE id')) {
      const staff = staffFixtures.find((s) => s.id === params[0]);
      return { rows: staff ? [staff] : [] };
    }
    if (sql.includes('UPDATE staff SET password_hash')) {
      const staff = staffFixtures.find((s) => s.id === params[1]);
      if (staff) { staff.password_hash = params[0]; staff.must_change_password = 0; }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO staff_sessions')) {
      const [token, staffId, role, fullName, expiresAt] = params;
      sessionFixtures.push({ token, staff_id: staffId, role, full_name: fullName, expires_at: expiresAt });
      return { rows: [] };
    }
    if (sql.includes('FROM staff_sessions ss')) {
      const session = sessionFixtures.find((s) => s.token === params[0]);
      if (!session) return { rows: [] };
      const staff = staffFixtures.find((s) => s.id === session.staff_id);
      return { rows: [{ ...session, staff_is_active: staff ? staff.is_active : 0 }] };
    }
    if (sql.includes('DELETE FROM staff_sessions WHERE token')) {
      sessionFixtures = sessionFixtures.filter((s) => s.token !== params[0]);
      return { rows: [] };
    }
    if (sql.includes('UPDATE staff SET failed_login_attempts = ?, locked_until = ?')) {
      const staff = staffFixtures.find((s) => s.id === params[2]);
      if (staff) { staff.failed_login_attempts = params[0]; staff.locked_until = params[1]; }
      return { rows: [] };
    }
    if (sql.includes('UPDATE staff SET failed_login_attempts = 0, locked_until = NULL')) {
      const staff = staffFixtures.find((s) => s.id === params[0]);
      if (staff) { staff.failed_login_attempts = 0; staff.locked_until = null; }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO audit_logs')) {
      return { rows: [] };
    }
    throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
  };

  ['../src/routes/authRoutes', '../src/routes/adminRoutes', '../src/routes/kioskRoutes', '../src/middleware/auth', '../src/services/authService']
    .forEach((p) => delete require.cache[require.resolve(p)]);
});

test('POST /api/kiosk/tickets: tu choi 400 kem thong bao than thien khi thieu serviceId (khong cham DB)', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/kiosk/tickets').send({ citizenName: 'Nguyễn Văn A' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /serviceId/);
});

test('POST /api/kiosk/tickets: KHONG bat buoc ho ten - cap ve thanh cong voi citizenName/phone = null', async () => {
  serviceRepo.findServiceById = async () => ({
    id: 1, name: 'Khai sinh', required_docs: [{ code: 'CCCD', name: 'CCCD', mandatory: true }]
  });
  const queueEngine = require('../src/services/queueEngine');
  let received;
  queueEngine.createTicket = async (args) => {
    received = args;
    return { ticket: { id: 't1', ticket_number: 'A-101' }, counter: { name: 'Quay 01' } };
  };
  const app = buildApp();
  const res = await request(app).post('/api/kiosk/tickets').send({ serviceId: 1, confirmedDocCodes: ['CCCD'] });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'QUEUED');
  assert.equal(received.citizenName, null);
  assert.equal(received.phone, null);
});

test('POST /api/kiosk/tickets: ten/SDT gui len (tuy chon) duoc trim va cat do dai', async () => {
  serviceRepo.findServiceById = async () => ({ id: 1, name: 'X', required_docs: [] });
  const queueEngine = require('../src/services/queueEngine');
  let received;
  queueEngine.createTicket = async (args) => { received = args; return { ticket: {}, counter: {} }; };
  const app = buildApp();
  await request(app).post('/api/kiosk/tickets').send({ serviceId: 1, citizenName: `  ${'A'.repeat(300)}  `, phone: '   ' });
  assert.equal(received.citizenName.length, 150);
  assert.equal(received.phone, null);
});

test('GET /api/kiosk/tickets/:id/status: id khong phai UUID -> 404 (khong cham DB)', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/kiosk/tickets/abc/status');
  assert.equal(res.status, 404);
});

test('GET /api/kiosk/tickets/:id/status: chi tra thong tin cong khai, khong lo ten/SDT/token', async () => {
  const ticketRepo = require('../src/repositories/ticketRepository');
  ticketRepo.getTrackingInfo = async () => ({
    id: '11111111-1111-4111-8111-111111111111', ticket_number: 'A-105', status: 'QUEUED', is_priority: 0,
    counter_name: 'Quầy 01', service_name: 'Khai sinh', sla_minutes: 15,
    citizen_name: 'BI MAT', phone: '0900000000', reentry_qr_token: 'secret',
    aheadCount: 2, activeCount: 1, avgSeconds: 300
  });
  const app = buildApp();
  const res = await request(app).get('/api/kiosk/tickets/11111111-1111-4111-8111-111111111111/status');
  assert.equal(res.status, 200);
  assert.equal(res.body.ticketNumber, 'A-105');
  assert.equal(res.body.aheadCount, 2);
  assert.equal(res.body.estimatedWaitMinutes, 15); // (2 truoc + 1 dang phuc vu) x 5 phut
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('BI MAT') && !raw.includes('0900000000') && !raw.includes('secret'));
});

test('GET /api/kiosk/services/:id/form-guide: 404 than thien khi thu tuc chua co huong dan', async () => {
  serviceRepo.findServiceById = async () => ({ id: 9, name: 'Khac', required_docs: [] });
  const formRepo = require('../src/repositories/formTemplateRepository');
  formRepo.findByServiceId = async () => null;
  const app = buildApp();
  const res = await request(app).get('/api/kiosk/services/9/form-guide');
  assert.equal(res.status, 404);
});

test('GET form-guide + checklist: tra huong dan tung o va danh dau giay to co huong dan dien', async () => {
  serviceRepo.findServiceById = async () => ({
    id: 1, name: 'Khai sinh', fee_amount: 0, sla_minutes: 15,
    required_docs: [
      { code: 'CCCD', name: 'CCCD', mandatory: true },
      { code: 'TOKHAI_KS', name: 'To khai', mandatory: true }
    ]
  });
  const formRepo = require('../src/repositories/formTemplateRepository');
  formRepo.findByServiceId = async () => ({
    id: 1, form_code: 'TK-KS-01', form_name: 'To khai khai sinh', shelf_name: 'Ke A', tray_number: 'Khay 1', desk_area: 'Ban A',
    fill_guide: { docCode: 'TOKHAI_KS', intro: 'x', fields: [{ label: 'Ho ten', how: 'In hoa', example: 'A' }], mistakes: [], after: [] }
  });
  const app = buildApp();

  const guide = await request(app).get('/api/kiosk/services/1/form-guide');
  assert.equal(guide.status, 200);
  assert.equal(guide.body.guide.fields[0].label, 'Ho ten');
  assert.ok(guide.body.generalRules.length > 0);
  assert.ok(guide.body.docHints.some((h) => h.code === 'CCCD'));
  assert.equal(guide.body.form.fill_guide, undefined); // khong lap lai noi dung guide trong form

  const checklist = await request(app).get('/api/kiosk/services/1/checklist');
  assert.equal(checklist.status, 200);
  assert.equal(checklist.body.hasFillGuide, true);
  assert.equal(checklist.body.requiredDocs.find((d) => d.code === 'TOKHAI_KS').hasFillGuide, true);
  assert.equal(checklist.body.requiredDocs.find((d) => d.code === 'CCCD').hasFillGuide, false);
  assert.ok(checklist.body.requiredDocs.find((d) => d.code === 'CCCD').hint);
  assert.equal(checklist.body.formTemplate.fill_guide, undefined);
});

test('GET /api/kiosk/services: tra ve 200 va danh sach thu tuc tu serviceRepo', async () => {
  serviceRepo.listServices = async () => [{ id: 1, name: 'Đăng ký khai sinh' }];
  const app = buildApp();
  const res = await request(app).get('/api/kiosk/services');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].name, 'Đăng ký khai sinh');
});

test('POST /api/auth/login: tu choi 400 khi thieu username/password (khong cham DB)', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/login').send({ username: 'officer01' });
  assert.equal(res.status, 400);
});

test('POST /api/auth/login: tu choi 401 khi sai mat khau', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'sai-mat-khau' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login: tu choi 401 khi tai khoan khong ton tai', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/login').send({ username: 'khong-ton-tai', password: 'x' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login: dang nhap thanh cong tra ve token + thong tin can bo', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'changeme' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.staff.role, 'OFFICER');
});

test('GET /api/admin/counters: tu choi 401 khi khong gui token (khong cham DB)', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/admin/counters');
  assert.equal(res.status, 401);
});

test('GET /api/admin/counters: tu choi 401 khi token khong hop le/da het han', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/admin/counters').set('Authorization', 'Bearer token-gia-khong-ton-tai');
  assert.equal(res.status, 401);
});

test('POST /api/admin/staff: tu choi 403 dung message khi dang nhap dung nhung khong du quyen (RBAC qua HTTP that)', async () => {
  const app = buildApp();
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'changeme' });
  const token = loginRes.body.token;

  const res = await request(app)
    .post('/api/admin/staff')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'X', username: 'y', password: '123456', role: 'OFFICER' });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /OFFICER/);
});

test('POST /api/auth/change-password: tu doi mat khau thanh cong khi dung mat khau hien tai', async () => {
  const app = buildApp();
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'changeme' });
  const token = loginRes.body.token;

  const res = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'changeme', newPassword: 'MatKhauMoi789' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('POST /api/auth/change-password: tu choi 400 khi mat khau hien tai sai', async () => {
  const app = buildApp();
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'changeme' });
  const token = loginRes.body.token;

  const res = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'sai-mat-khau', newPassword: 'MatKhauMoi789' });
  assert.equal(res.status, 400);
});

test('POST /api/auth/login: khoa tai khoan sau 5 lan sai mat khau lien tiep, lan thu 6 bi tu choi du dung mat khau', async () => {
  const app = buildApp();
  for (let i = 0; i < 5; i += 1) {
    const res = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'sai-mat-khau' });
    assert.equal(res.status, 401);
  }
  const res = await request(app).post('/api/auth/login').send({ username: 'officer01', password: 'changeme' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /tam khoa/);
});

test('POST /api/admin/rebalance: dang nhap dung quyen nhung tu choi 400 khi thieu percent (validate.js qua HTTP that)', async () => {
  const app = buildApp();
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'superadmin', password: 'changeme' });
  const token = loginRes.body.token;

  const res = await request(app)
    .post('/api/admin/rebalance')
    .set('Authorization', `Bearer ${token}`)
    .send({ fromCounterId: 1, toCounterId: 2 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Ty le/);
});

test('GET /khong-ton-tai: 404 dang JSON cho request API (khong phai trang HTML mac dinh cua Express)', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/khong-ton-tai');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Khong tim thay endpoint.');
});

test('POST /api/kiosk/tickets: ngoai gio lam viec -> 200 status CLOSED kem thong bao + gio mo cua, KHONG cap so', async () => {
  serviceRepo.findServiceById = async () => ({ id: 1, name: 'Khai sinh', required_docs: [] });
  const kioskHours = require('../src/services/kioskHours');
  kioskHours.getStatus = async () => kioskHours.evaluate(
    { enforced: true, openTime: '07:30', closeTime: '17:00', workingDays: '1,2,3,4,5' }, new Date('2026-09-25T13:00:00Z')
  );
  const queueEngine = require('../src/services/queueEngine');
  let created = false;
  queueEngine.createTicket = async () => { created = true; return { ticket: {}, counter: {} }; };
  const app = buildApp();
  const res = await request(app).post('/api/kiosk/tickets').send({ serviceId: 1, confirmedDocCodes: [] });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'CLOSED');
  assert.match(res.body.message, /Thứ Hai, 28\/09\/2026/);
  assert.equal(res.body.opensAt.time, '07:30');
  assert.equal(created, false);
});

test('POST /api/kiosk/tickets: khong doc duoc cau hinh gio (loi DB) -> khong khoa cap so (fail-open)', async () => {
  serviceRepo.findServiceById = async () => ({ id: 1, name: 'X', required_docs: [] });
  const kioskHours = require('../src/services/kioskHours');
  kioskHours.getStatus = async () => { throw new Error('Tham so cau hinh khong ton tai'); };
  const queueEngine = require('../src/services/queueEngine');
  queueEngine.createTicket = async () => ({ ticket: { id: 't' }, counter: {} });
  const app = buildApp();
  const res = await request(app).post('/api/kiosk/tickets').send({ serviceId: 1, confirmedDocCodes: [] });
  assert.equal(res.status, 201);
});

test('GET /api/kiosk/hours: tra trang thai cong khai (dong cua + thong bao)', async () => {
  const kioskHours = require('../src/services/kioskHours');
  kioskHours.getStatus = async () => kioskHours.evaluate(
    { enforced: true, openTime: '07:30', closeTime: '17:00', workingDays: '1,2,3,4,5' }, new Date('2026-09-20T03:00:00Z')
  );
  const app = buildApp();
  const res = await request(app).get('/api/kiosk/hours');
  assert.equal(res.status, 200);
  assert.equal(res.body.open, false);
  assert.equal(res.body.enforced, true);
  assert.match(res.body.message, /Thứ Hai/);
});
