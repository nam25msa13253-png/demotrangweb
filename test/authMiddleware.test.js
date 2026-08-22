const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requirePermission, PERMISSION_GROUPS } = require('../src/middleware/auth');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

test('PERMISSION_GROUPS: chi SUPER_ADMIN duoc CONFIG va STAFF_MANAGEMENT (nhay cam nhat)', () => {
  assert.deepEqual(PERMISSION_GROUPS.CONFIG, ['SUPER_ADMIN']);
  assert.deepEqual(PERMISSION_GROUPS.STAFF_MANAGEMENT, ['SUPER_ADMIN']);
});

test('PERMISSION_GROUPS: OFFICER khong nam trong nhom DISPATCH (khong duoc xoa/dieu phoi quay)', () => {
  assert.ok(!PERMISSION_GROUPS.DISPATCH.includes('OFFICER'));
});

test('requirePermission: cho qua khi role hop le', () => {
  const middleware = requirePermission('MONITOR');
  const req = { staff: { role: 'SUPERVISOR' } };
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.body, null);
});

test('requirePermission: tra ve 403 kem dung ten role khi khong du quyen', () => {
  const middleware = requirePermission('STAFF_MANAGEMENT');
  const req = { staff: { role: 'OFFICER' } };
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /OFFICER/);
});

test('requirePermission: tra ve 401 khi chua xac thuc (req.staff rong)', () => {
  const middleware = requirePermission('MONITOR');
  const req = {};
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('requirePermission: nem loi ro rang neu goi nham ten nhom quyen khong ton tai', () => {
  assert.throws(() => requirePermission('KHONG_TON_TAI'), /Nhom quyen khong ton tai/);
});
