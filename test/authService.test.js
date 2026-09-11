// Kiem tra authService.js (xac thuc token phien + thu hoi phien) ma KHONG can Postgres that -
// gia lap pool.query() nhu cac test khac trong bo. Trong tam la 2 hanh vi: (1) token het han bi
// tu choi, (2) token cua tai khoan da bi khoa (staff.is_active = 0) PHAI bi tu choi ngay lap
// tuc - day la lo hong da phat hien va vua sua (truoc day chi kiem tra rieng bang staff_
// sessions, khong doi chieu staff.is_active, nen tai khoan vua bi khoa van dung duoc token cu
// toi khi het han tu nhien, toi da 8 gio).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const db = require('../src/config/db');

// Cost thap (4) chi de test chay nhanh - khong lien quan BCRYPT_COST=12 dung trong code that.
const KNOWN_PASSWORD = 'MatKhau123';
const KNOWN_HASH = bcrypt.hashSync(KNOWN_PASSWORD, 4);

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

// ===================== login(): khoa tai khoan sau nhieu lan sai + audit log =====================
function makeStaff(overrides) {
  return {
    id: 'staff-1', username: 'officer01', password_hash: KNOWN_HASH, role: 'OFFICER',
    full_name: 'Nguyễn Văn A', is_active: 1, failed_login_attempts: 0, locked_until: null,
    must_change_password: 0,
    ...overrides
  };
}

let staffRow;
let staffUpdates;
let insertedSessions;
let insertedAuditLogs;

function installLoginMock() {
  staffUpdates = [];
  insertedSessions = [];
  insertedAuditLogs = [];
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT * FROM staff WHERE username')) {
      return staffRow && staffRow.username === params[0] ? { rows: [staffRow] } : { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM staff WHERE id')) {
      return staffRow && staffRow.id === params[0] ? { rows: [staffRow] } : { rows: [] };
    }
    if (sql.startsWith('UPDATE staff SET failed_login_attempts = ?, locked_until = ? WHERE')) {
      staffRow.failed_login_attempts = params[0];
      staffRow.locked_until = params[1];
      staffUpdates.push({ failedLoginAttempts: params[0], lockedUntil: params[1] });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE staff SET failed_login_attempts = 0, locked_until = NULL')) {
      staffRow.failed_login_attempts = 0;
      staffRow.locked_until = null;
      staffUpdates.push({ reset: true });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE staff SET password_hash')) {
      staffRow.password_hash = params[0];
      staffRow.must_change_password = 0;
      staffUpdates.push({ passwordChanged: true });
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO staff_sessions')) {
      insertedSessions.push(params);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO audit_logs')) {
      insertedAuditLogs.push({ sql, params });
      return { rows: [] };
    }
    throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
  };
  delete require.cache[require.resolve('../src/services/authService')];
}

test('login: dang nhap thanh cong voi mat khau dung, tra ve token va reset so lan sai', async () => {
  staffRow = makeStaff({ failed_login_attempts: 2 });
  installLoginMock();
  const authService = require('../src/services/authService');

  const result = await authService.login('officer01', KNOWN_PASSWORD, '1.2.3.4');
  assert.equal(typeof result.token, 'string');
  assert.equal(result.staff.username, 'officer01');
  assert.equal(result.mustChangePassword, false);
  assert.equal(insertedSessions.length, 1);
  assert.deepEqual(staffUpdates, [{ reset: true }]);
});

test('login: sai mat khau tang so lan that bai va ghi audit log LOGIN_FAILED', async () => {
  staffRow = makeStaff();
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.login('officer01', 'sai-mat-khau', '1.2.3.4'), /Sai ten dang nhap hoac mat khau/);
  assert.deepEqual(staffUpdates, [{ failedLoginAttempts: 1, lockedUntil: null }]);
  assert.equal(insertedAuditLogs.length, 1);
  assert.match(insertedAuditLogs[0].sql, /LOGIN_FAILED/);
  assert.deepEqual(insertedAuditLogs[0].params, [null, 'officer01', '1.2.3.4']);
});

test('login: khoa tai khoan 15 phut sau 5 lan sai lien tiep', async () => {
  staffRow = makeStaff({ failed_login_attempts: 4 });
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.login('officer01', 'sai-mat-khau', '1.2.3.4'));
  assert.equal(staffUpdates[0].failedLoginAttempts, 5);
  assert.ok(staffUpdates[0].lockedUntil instanceof Date);
  assert.ok(staffUpdates[0].lockedUntil.getTime() > Date.now());
});

test('login: tu choi ngay khi tai khoan dang trong thoi gian khoa, du dung mat khau', async () => {
  staffRow = makeStaff({ locked_until: new Date(Date.now() + 5 * 60 * 1000) });
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.login('officer01', KNOWN_PASSWORD, '1.2.3.4'), /tam khoa/);
  assert.equal(insertedSessions.length, 0);
});

test('login: username khong ton tai tra ve loi giong het sai mat khau (khong lo tai khoan)', async () => {
  staffRow = null;
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.login('khong-ton-tai', 'bat-ky', '1.2.3.4'), /Sai ten dang nhap hoac mat khau/);
});

// ===================== changePassword(): tu doi mat khau =====================
test('changePassword: doi thanh cong khi dung mat khau hien tai va mat khau moi hop le', async () => {
  staffRow = makeStaff({ must_change_password: 1 });
  installLoginMock();
  const authService = require('../src/services/authService');

  await authService.changePassword('staff-1', KNOWN_PASSWORD, 'MatKhauMoi456');
  assert.equal(staffRow.must_change_password, 0);
  assert.notEqual(staffRow.password_hash, KNOWN_HASH);
});

test('changePassword: tu choi neu mat khau hien tai sai', async () => {
  staffRow = makeStaff();
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.changePassword('staff-1', 'sai-mat-khau', 'MatKhauMoi456'), /Mat khau hien tai khong dung/);
});

test('changePassword: tu choi neu mat khau moi khong dat chinh sach (qua ngan / thieu so)', async () => {
  staffRow = makeStaff();
  installLoginMock();
  const authService = require('../src/services/authService');

  await assert.rejects(() => authService.changePassword('staff-1', KNOWN_PASSWORD, 'short'), /toi thieu 8 ky tu/);
  await assert.rejects(() => authService.changePassword('staff-1', KNOWN_PASSWORD, 'chukhongcoso'), /co ca chu va so/);
});
