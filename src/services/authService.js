const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { validatePassword, BCRYPT_COST } = require('../utils/passwordPolicy');

// Phien dang nhap luu trong bang `staff_sessions` (Postgres), KHONG con dung Map trong bo
// nho nhu truoc - ly do: Render (va PaaS noi chung) co the restart/redeploy server bat cu
// luc nao (VD deploy code moi, free tier sleep/wake...), Map trong bo nho se mat toan bo
// phien dang nhap moi lan nhu vay, bat moi nguoi dang nhap lai. Luu trong DB da co san
// (khong can them Redis/dich vu moi) giai quyet triet de van de nay.
// San xuat that hon nua: co the thay bang JWT co ky/het han hoac tich hop SSO cua co quan.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 gio

// Chong brute-force theo TUNG TAI KHOAN (khac voi rate-limit theo IP o server.js): 1 ke tan
// cong dung nhieu IP/proxy khac nhau van khong do duoc so lan thu tren 1 username cu the.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 phut

async function registerFailedAttempt(staff) {
  const attempts = (staff.failed_login_attempts || 0) + 1;
  const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
  await pool.query(
    'UPDATE staff SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
    [attempts, lockedUntil, staff.id]
  );
}

async function login(username, password, ip) {
  const { rows } = await pool.query('SELECT * FROM staff WHERE username = ?', [username]);
  const staff = rows[0];

  // Tai khoan dang bi khoa tam thoi do dang nhap sai qua nhieu lan - tu bao het han sau
  // LOCK_DURATION_MS, khong can Admin can thiep thu cong.
  if (staff && staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000);
    throw new Error(`Tai khoan tam khoa do dang nhap sai qua nhieu lan. Vui long thu lai sau khoang ${minutesLeft} phut.`);
  }

  const valid = !!staff && !!staff.is_active && await bcrypt.compare(password, staff.password_hash);
  if (!valid) {
    // Chi dem lan sai neu tai khoan CO TON TAI - tranh 1 username khong ton tai lam phinh du
    // lieu vo ich, dong thoi KHONG duoc tra ve thong bao khac nhau giua "sai username" va "sai
    // mat khau" (giu nguyen thong bao gop chung ben duoi) de tranh lo tai khoan nao co that.
    if (staff && staff.is_active) await registerFailedAttempt(staff);
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, reason) VALUES (?, 'LOGIN_FAILED', 'STAFF', ?, ?)`,
      [null, username || '', ip || null]
    );
    throw new Error('Sai ten dang nhap hoac mat khau.');
  }

  if (staff.failed_login_attempts > 0 || staff.locked_until) {
    await pool.query('UPDATE staff SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [staff.id]);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(
    `INSERT INTO staff_sessions (token, staff_id, role, full_name, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [token, staff.id, staff.role, staff.full_name, expiresAt]
  );
  return {
    token,
    staff: { id: staff.id, fullName: staff.full_name, role: staff.role, username: staff.username },
    mustChangePassword: !!staff.must_change_password
  };
}

// Tu doi mat khau (khac resetStaffPassword cua Admin): nguoi dung phai biet mat khau HIEN TAI
// moi doi duoc - dung cho man "Doi mat khau" sau khi dang nhap va cho buoc bat buoc doi mat
// khau mac dinh/mat khau Admin vua cap (must_change_password = 1).
async function changePassword(staffId, currentPassword, newPassword) {
  validatePassword(newPassword);
  const { rows } = await pool.query('SELECT * FROM staff WHERE id = ?', [staffId]);
  const staff = rows[0];
  if (!staff) throw new Error('Tai khoan khong ton tai.');

  const valid = await bcrypt.compare(currentPassword, staff.password_hash);
  if (!valid) throw new Error('Mat khau hien tai khong dung.');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.query(
    'UPDATE staff SET password_hash = ?, must_change_password = 0 WHERE id = ?',
    [passwordHash, staffId]
  );
}

async function verifyToken(token) {
  // JOIN voi staff.is_active: neu khong chi doc rieng bang staff_sessions, 1 tai khoan vua bi
  // Admin khoa (setStaffActive isActive=false) van dung duoc token cu cho toi khi het han (toi
  // da 8 gio) vi phien dang nhap khong tu dong mat theo trang thai khoa cua tai khoan - phai
  // kiem tra ca 2 dieu kien trong cung 1 lan doc.
  const { rows } = await pool.query(
    `SELECT ss.*, s.is_active AS staff_is_active FROM staff_sessions ss
     JOIN staff s ON s.id = ss.staff_id WHERE ss.token = ?`,
    [token]
  );
  const session = rows[0];
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now() || !session.staff_is_active) {
    await pool.query('DELETE FROM staff_sessions WHERE token = ?', [token]);
    return null;
  }
  return { staffId: session.staff_id, role: session.role, fullName: session.full_name };
}

// Thu hoi toan bo phien dang nhap cua 1 can bo - goi khi khoa tai khoan (setStaffActive) hoac
// dat lai mat khau (resetStaffPassword), de dam bao token cu (con dang mo o thiet bi khac)
// khong con dung duoc ngay lap tuc thay vi phai cho het han tu nhien (toi da 8 gio).
async function revokeAllSessionsForStaff(staffId) {
  await pool.query('DELETE FROM staff_sessions WHERE staff_id = ?', [staffId]);
}

async function logout(token) {
  await pool.query('DELETE FROM staff_sessions WHERE token = ?', [token]);
}

// Don dep phien het han dinh ky - khong bat buoc (verifyToken da tu xoa phien het han khi
// gap phai) nhung giup bang staff_sessions khong phinh to voi rac theo thoi gian.
function startExpiredSessionCleanup() {
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 gio/lan
  setInterval(() => {
    pool.query('DELETE FROM staff_sessions WHERE expires_at < CURRENT_TIMESTAMP')
      .catch((err) => console.error('[authService] Loi don dep phien het han:', err));
  }, CLEANUP_INTERVAL_MS).unref();
}

module.exports = { login, changePassword, verifyToken, logout, revokeAllSessionsForStaff, startExpiredSessionCleanup };
