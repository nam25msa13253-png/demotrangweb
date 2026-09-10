// Kiem tra authService.js (xac thuc token phien + thu hoi phien) ma KHONG can Postgres that -
// gia lap pool.query() nhu cac test khac trong bo. Trong tam la 2 hanh vi: (1) token het han bi
// tu choi, (2) token cua tai khoan da bi khoa (staff.is_active = 0) PHAI bi tu choi ngay lap
// tuc - day la lo hong da phat hien va vua sua (truoc day chi kiem tra rieng bang staff_
// sessions, khong doi chieu staff.is_active, nen tai khoan vua bi khoa van dung duoc token cu
// toi khi het han tu nhien, toi da 8 gio).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');

let deletedTokens;
let deletedByStaffId;

function makeSession(overrides) {
  return {
    token: 'tok-abc', staff_id: 'staff-1', role: 'OFFICER', full_name: 'Nguyễn Văn A',
    expires_at: new Date(Date.now() + 60 * 60 * 1000), staff_is_active: 1,
    ...overrides
  };
}

let currentSession;

beforeEach(() => {
  deletedTokens = [];
  deletedByStaffId = [];
  currentSession = makeSession();
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT ss.*')) {
      return currentSession && currentSession.token === params[0] ? { rows: [currentSession] } : { rows: [] };
    }
    if (sql.startsWith('DELETE FROM staff_sessions WHERE token')) {
      deletedTokens.push(params[0]);
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM staff_sessions WHERE staff_id')) {
      deletedByStaffId.push(params[0]);
      return { rows: [] };
    }
    throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
  };
  delete require.cache[require.resolve('../src/services/authService')];
});

test('verifyToken: tra ve thong tin phien hop le khi token con han va tai khoan dang hoat dong', async () => {
  const authService = require('../src/services/authService');
  const session = await authService.verifyToken('tok-abc');
  assert.deepEqual(session, { staffId: 'staff-1', role: 'OFFICER', fullName: 'Nguyễn Văn A' });
});

test('verifyToken: tra ve null khi token khong ton tai', async () => {
  const authService = require('../src/services/authService');
  const session = await authService.verifyToken('token-khong-ton-tai');
  assert.equal(session, null);
});

test('verifyToken: tra ve null va tu xoa phien khi da het han', async () => {
  currentSession = makeSession({ expires_at: new Date(Date.now() - 1000) });
  const authService = require('../src/services/authService');
  const session = await authService.verifyToken('tok-abc');
  assert.equal(session, null);
  assert.deepEqual(deletedTokens, ['tok-abc']);
});

test('verifyToken: tu choi va xoa phien neu tai khoan da bi khoa (staff.is_active = 0), du token con han', async () => {
  currentSession = makeSession({ staff_is_active: 0 });
  const authService = require('../src/services/authService');
  const session = await authService.verifyToken('tok-abc');
  assert.equal(session, null);
  assert.deepEqual(deletedTokens, ['tok-abc']);
});

test('revokeAllSessionsForStaff: xoa tat ca phien theo staff_id', async () => {
  const authService = require('../src/services/authService');
  await authService.revokeAllSessionsForStaff('staff-1');
  assert.deepEqual(deletedByStaffId, ['staff-1']);
});
