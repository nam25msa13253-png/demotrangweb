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

test('POST /api/kiosk/tickets: tu choi 400 khi thieu ho ten', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/kiosk/tickets').send({ serviceId: 1 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Ho ten/);
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
