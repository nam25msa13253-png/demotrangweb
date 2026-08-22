async function listAll(client) {
  const { rows } = await client.query(
    `SELECT c.*, sf.name AS field_name, sf.code AS field_code, s.full_name AS officer_name,
            t.ticket_number AS active_ticket_number, t.status AS active_ticket_status
     FROM counters c
     JOIN service_fields sf ON sf.id = c.field_id
     LEFT JOIN staff s ON s.id = c.officer_id
     LEFT JOIN tickets t ON t.id = c.active_ticket_id
     WHERE c.is_deleted = 0
     ORDER BY c.code ASC`
  );
  return rows;
}

async function findById(client, counterId) {
  const { rows } = await client.query('SELECT * FROM counters WHERE id = ? AND is_deleted = 0', [counterId]);
  return rows[0] || null;
}

async function lockById(client, counterId) {
  const { rows } = await client.query('SELECT * FROM counters WHERE id = ? AND is_deleted = 0 FOR UPDATE', [counterId]);
  return rows[0] || null;
}

async function listOpenByField(client, fieldId, excludeCounterId) {
  const { rows } = await client.query(
    `SELECT * FROM counters WHERE field_id = ? AND status = 'OPEN' AND is_deleted = 0 AND id != ?`,
    [fieldId, excludeCounterId || -1]
  );
  return rows;
}

// Least Queue Depth: quay OPEN, cung linh vuc, dang co it ve dang QUEUED/CALLING/PROCESSING nhat.
// excludeCounterId: dung khi can tim quay THAY THE cho 1 quay khac cung linh vuc (VD: xoa quay,
// san tai) - chinh quay dang xu ly khong duoc tinh la ung vien thay the cho chinh no.
async function findLeastLoadedByField(client, fieldId, excludeCounterId) {
  const { rows } = await client.query(
    `SELECT c.*, SUM(CASE WHEN t.status IN ('QUEUED','CALLING','PROCESSING') THEN 1 ELSE 0 END) AS load_count
     FROM counters c
     LEFT JOIN tickets t ON t.counter_id = c.id
     WHERE c.field_id = ? AND c.status = 'OPEN' AND c.is_deleted = 0 AND c.id != ?
     GROUP BY c.id
     ORDER BY load_count ASC, c.id ASC
     LIMIT 1`,
    [fieldId, excludeCounterId || -1]
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

// Gan can bo phu trach quay. Mot can bo chi phu trach 1 quay tai 1 thoi diem nen phai go
// can bo do khoi cac quay khac truoc khi gan vao quay moi (tranh 1 tai khoan dung dong thoi
// nhieu quay).
async function clearOfficerFromOtherCounters(client, officerId, exceptCounterId) {
  await client.query('UPDATE counters SET officer_id = NULL WHERE officer_id = ? AND id != ?', [officerId, exceptCounterId]);
}

async function updateOfficer(client, counterId, officerId) {
  await client.query('UPDATE counters SET officer_id = ? WHERE id = ?', [officerId, counterId]);
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

// Soft-delete: khong DELETE that dong quay (se vi pham FK RESTRICT tu tickets/
// ticket_status_history da tham chieu toi, pha vo Audit Trail). Thay vao do danh dau
// is_deleted = 1, dong quay va go can bo, doi ma quay sang dang luu tru de giai phong
// ma quay goc (VD "QUAY-06") cho lan tao moi sau nay.
async function softDelete(client, counterId, archivedCode) {
  await client.query(
    `UPDATE counters SET is_deleted = 1, status = 'CLOSED', officer_id = NULL, active_ticket_id = NULL, code = ? WHERE id = ?`,
    [archivedCode, counterId]
  );
}

module.exports = {
  listAll, findById, lockById, listOpenByField, findLeastLoadedByField,
  updateStatus, updateField, setActiveTicket, create, updateDetails, softDelete,
  clearOfficerFromOtherCounters, updateOfficer
};
