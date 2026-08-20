// Truy van CSDL cho bang staff. Khong tra password_hash o cac ham list/read cong khai qua API.
// LEFT JOIN counters de tab Quan ly Tai khoan hien thi luon quay dang gan cho tung Officer -
// tranh phai nhay sang tab Dieu phoi moi biet tai khoan nao dang phu trach quay nao.
async function listAll(client) {
  const { rows } = await client.query(
    `SELECT s.id, s.full_name, s.username, s.role, s.is_active, s.created_at,
            c.code AS counter_code, c.name AS counter_name
     FROM staff s
     LEFT JOIN counters c ON c.officer_id = s.id
     ORDER BY s.created_at DESC`
  );
  return rows;
}

async function findById(client, id) {
  const { rows } = await client.query('SELECT * FROM staff WHERE id = ?', [id]);
  return rows[0] || null;
}

// Danh sach rut gon (khong password_hash) theo vai tro - dung cho dropdown gan can bo vao
// quay o tab Dieu phoi (DISPATCH), pham vi quyen hep hon so voi STAFF_MANAGEMENT day du.
async function listByRole(client, role) {
  const { rows } = await client.query(
    `SELECT id, full_name, username, is_active FROM staff WHERE role = ? ORDER BY full_name ASC`,
    [role]
  );
  return rows;
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

module.exports = { listAll, findById, findByUsername, listByRole, create, updateActive, updatePassword };
