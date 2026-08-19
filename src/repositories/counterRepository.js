async function listAll(client) {
  const { rows } = await client.query(
    `SELECT c.*, sf.name AS field_name, sf.code AS field_code, s.full_name AS officer_name,
            t.ticket_number AS active_ticket_number, t.status AS active_ticket_status
     FROM counters c
     JOIN service_fields sf ON sf.id = c.field_id
     LEFT JOIN staff s ON s.id = c.officer_id
     LEFT JOIN tickets t ON t.id = c.active_ticket_id
     ORDER BY c.code ASC`
  );
  return rows;
}

async function findById(client, counterId) {
  const { rows } = await client.query('SELECT * FROM counters WHERE id = ?', [counterId]);
  return rows[0] || null;
}

async function lockById(client, counterId) {
  const { rows } = await client.query('SELECT * FROM counters WHERE id = ? FOR UPDATE', [counterId]);
  return rows[0] || null;
}

async function listOpenByField(client, fieldId, excludeCounterId) {
  const { rows } = await client.query(
    `SELECT * FROM counters WHERE field_id = ? AND status = 'OPEN' AND id != ?`,
    [fieldId, excludeCounterId || -1]
  );
  return rows;
}

// Least Queue Depth: quay OPEN, cung linh vuc, dang co it ve dang QUEUED/CALLING/PROCESSING nhat.
async function findLeastLoadedByField(client, fieldId) {
  const { rows } = await client.query(
    `SELECT c.*, SUM(CASE WHEN t.status IN ('QUEUED','CALLING','PROCESSING') THEN 1 ELSE 0 END) AS load_count
     FROM counters c
     LEFT JOIN tickets t ON t.counter_id = c.id
     WHERE c.field_id = ? AND c.status = 'OPEN'
     GROUP BY c.id
     ORDER BY load_count ASC, c.id ASC
     LIMIT 1`,
    [fieldId]
  );
  return rows[0] || null;
}

async function updateStatus(client, counterId, status) {
  await client.query('UPDATE counters SET status = ? WHERE id = ?', [status, counterId]);
  return findById(client, counterId);
}

async function updateField(client, counterId, fieldId) {
  await client.query('UPDATE counters SET field_id = ? WHERE id = ?', [fieldId, counterId]);
  return findById(client, counterId);
}

async function setActiveTicket(client, counterId, ticketId) {
  await client.query('UPDATE counters SET active_ticket_id = ? WHERE id = ?', [ticketId, counterId]);
  return findById(client, counterId);
}

// Them quay moi (moi phuong/xa co so luong quay khac nhau nen can linh hoat tao/sua/xoa
// thay vi co dinh 5 quay nhu seed data mau).
async function create(client, { code, name, fieldId }) {
  await client.query(
    `INSERT INTO counters (code, name, field_id, status) VALUES (?, ?, ?, 'CLOSED')`,
    [code, name, fieldId]
  );
  const { rows } = await client.query('SELECT * FROM counters WHERE code = ?', [code]);
  return rows[0];
}

async function updateDetails(client, counterId, { code, name }) {
  await client.query('UPDATE counters SET code = ?, name = ? WHERE id = ?', [code, name, counterId]);
  return findById(client, counterId);
}

async function remove(client, counterId) {
  await client.query('DELETE FROM counters WHERE id = ?', [counterId]);
}

module.exports = {
  listAll, findById, lockById, listOpenByField, findLeastLoadedByField,
  updateStatus, updateField, setActiveTicket, create, updateDetails, remove
};
