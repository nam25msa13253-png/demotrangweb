// Truy van CSDL cho bang staff. Khong tra password_hash o cac ham list/read cong khai qua API.
async function listAll(client) {
  const { rows } = await client.query(
    `SELECT id, full_name, username, role, is_active, created_at FROM staff ORDER BY created_at DESC`
  );
  return rows;
}

async function findById(client, id) {
  const { rows } = await client.query('SELECT * FROM staff WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findByUsername(client, username) {
  const { rows } = await client.query('SELECT * FROM staff WHERE username = ?', [username]);
  return rows[0] || null;
}

async function create(client, { id, fullName, username, passwordHash, role }) {
  const { rows } = await client.query(
    `INSERT INTO staff (id, full_name, username, password_hash, role)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, full_name, username, role, is_active, created_at`,
    [id, fullName, username, passwordHash, role]
  );
  return rows[0];
}

async function updateActive(client, id, isActive) {
  const { rows } = await client.query(
    `UPDATE staff SET is_active = ? WHERE id = ?
     RETURNING id, full_name, username, role, is_active, created_at`,
    [isActive ? 1 : 0, id]
  );
  return rows[0];
}

async function updatePassword(client, id, passwordHash) {
  await client.query('UPDATE staff SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

module.exports = { listAll, findById, findByUsername, create, updateActive, updatePassword };
