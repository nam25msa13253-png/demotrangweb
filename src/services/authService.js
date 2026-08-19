const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// Luu token phien lam viec trong bo nho (don gian hoa cho pham vi du an tham khao).
// San xuat that: thay bang JWT co ky/het han hoac tich hop SSO cua co quan.
const tokenStore = new Map(); // token -> { staffId, role, fullName, expiresAt }
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 gio

async function login(username, password) {
  const { rows } = await pool.query('SELECT * FROM staff WHERE username = ? AND is_active = 1', [username]);
  const staff = rows[0];
  if (!staff) throw new Error('Sai ten dang nhap hoac mat khau.');

  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) throw new Error('Sai ten dang nhap hoac mat khau.');

  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, {
    staffId: staff.id, role: staff.role, fullName: staff.full_name,
    expiresAt: Date.now() + TOKEN_TTL_MS
  });
  return { token, staff: { id: staff.id, fullName: staff.full_name, role: staff.role, username: staff.username } };
}

function verifyToken(token) {
  const session = tokenStore.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  return session;
}

function logout(token) {
  tokenStore.delete(token);
}

module.exports = { login, verifyToken, logout };
