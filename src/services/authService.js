const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// Phien dang nhap luu trong bang `staff_sessions` (Postgres), KHONG con dung Map trong bo
// nho nhu truoc - ly do: Render (va PaaS noi chung) co the restart/redeploy server bat cu
// luc nao (VD deploy code moi, free tier sleep/wake...), Map trong bo nho se mat toan bo
// phien dang nhap moi lan nhu vay, bat moi nguoi dang nhap lai. Luu trong DB da co san
// (khong can them Redis/dich vu moi) giai quyet triet de van de nay.
// San xuat that hon nua: co the thay bang JWT co ky/het han hoac tich hop SSO cua co quan.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 gio

async function login(username, password) {
  const { rows } = await pool.query('SELECT * FROM staff WHERE username = ? AND is_active = 1', [username]);
  const staff = rows[0];
  if (!staff) throw new Error('Sai ten dang nhap hoac mat khau.');

  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) throw new Error('Sai ten dang nhap hoac mat khau.');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(
    `INSERT INTO staff_sessions (token, staff_id, role, full_name, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [token, staff.id, staff.role, staff.full_name, expiresAt]
  );
  return { token, staff: { id: staff.id, fullName: staff.full_name, role: staff.role, username: staff.username } };
}

async function verifyToken(token) {
  const { rows } = await pool.query('SELECT * FROM staff_sessions WHERE token = ?', [token]);
  const session = rows[0];
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await pool.query('DELETE FROM staff_sessions WHERE token = ?', [token]);
    return null;
  }
  return { staffId: session.staff_id, role: session.role, fullName: session.full_name };
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

module.exports = { login, verifyToken, logout, startExpiredSessionCleanup };
