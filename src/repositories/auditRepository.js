const { parseJson } = require('../utils/json');

// Audit Trail: append-only. Khong bao gio UPDATE/DELETE (rang buoc dam bao o tang ung dung -
// khong co ham update/delete nao duoc export tu module nay).
async function insertLog(client, { adminId, action, targetType, targetId, reason, payload }) {
  await client.query(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, reason, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [adminId || null, action, targetType, String(targetId || ''), reason || null, payload ? JSON.stringify(payload) : null]
  );
}

async function listRecent(client, limit = 100) {
  const { rows } = await client.query(
    `SELECT al.*, s.full_name AS admin_name FROM audit_logs al
     LEFT JOIN staff s ON s.id = al.admin_id
     ORDER BY al.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ ...r, payload: parseJson(r.payload) }));
}

module.exports = { insertLog, listRecent };
