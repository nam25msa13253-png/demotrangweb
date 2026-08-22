// Truy van du lieu bang `tickets`. Moi ham nhan `client` (adapter tu src/config/db.js)
// de co the tham gia chung 1 transaction voi cac repository khac (trach Race Condition).
//
// MariaDB 10.4 khong ho tro RETURNING nen sau moi INSERT/UPDATE can SELECT lai theo id
// de tra ve ban ghi day du (giong hanh vi RETURNING * cua PostgreSQL).
const { newId } = require('../utils/uuid');
const { parseJson } = require('../utils/json');

function mapTicket(row) {
  if (!row) return null;
  return { ...row, missing_doc_codes: parseJson(row.missing_doc_codes) };
}

async function insertTicket(client, {
  ticketNumber, serviceId, counterId, citizenName, phone,
  isPriority = false, priorityReasonId = null, queuePosition = null
}) {
  const id = newId();
  await client.query(
    `INSERT INTO tickets (id, ticket_number, service_id, counter_id, citizen_name, phone, status, retry_count, is_priority, priority_reason_id, queue_position)
     VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', 0, ?, ?, ?)`,
    [id, ticketNumber, serviceId, counterId, citizenName, phone, isPriority ? 1 : 0, priorityReasonId, queuePosition]
  );
  return findTicketById(client, id);
}

async function lockTicketById(client, ticketId) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = ? FOR UPDATE', [ticketId]);
  return mapTicket(rows[0]);
}

async function findTicketById(client, ticketId) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  return mapTicket(rows[0]);
}

async function findByReentryToken(client, token) {
  const { rows } = await client.query(
    "SELECT * FROM tickets WHERE reentry_qr_token = ? AND status = 'SUPP_PENDING' FOR UPDATE",
    [token]
  );
  return mapTicket(rows[0]);
}

// Vé QUEUED tiếp theo của 1 quầy, ưu tiên is_priority rồi tới queue_position/created_at (FIFO).
async function findNextQueuedForCounter(client, counterId) {
  const { rows } = await client.query(
    `SELECT * FROM tickets
     WHERE counter_id = ? AND status = 'QUEUED'
     ORDER BY is_priority DESC, queue_position ASC, created_at ASC
     LIMIT 1
     FOR UPDATE`,
    [counterId]
  );
  return mapTicket(rows[0]);
}

async function countActiveForCounter(client, counterId) {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM tickets
     WHERE counter_id = ? AND status IN ('QUEUED', 'CALLING', 'PROCESSING')`,
    [counterId]
  );
  return Number(rows[0].cnt);
}

async function maxQueuePositionForCounter(client, counterId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM tickets
     WHERE counter_id = ? AND status IN ('QUEUED', 'CALLING', 'PROCESSING')`,
    [counterId]
  );
  return Number(rows[0].max_pos);
}

async function updateStatus(client, ticketId, fields) {
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }
  values.push(ticketId);
  await client.query(`UPDATE tickets SET ${setClauses.join(', ')} WHERE id = ?`, values);
  return findTicketById(client, ticketId);
}

async function insertHistory(client, { ticketId, fromStatus, toStatus, counterId, officerId, eventData }) {
  await client.query(
    `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, counter_id, officer_id, event_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ticketId, fromStatus, toStatus, counterId || null, officerId || null, eventData ? JSON.stringify(eventData) : null]
  );
}

async function listQueueForCounter(client, counterId) {
  const { rows } = await client.query(
    `SELECT * FROM tickets
     WHERE counter_id = ? AND status IN ('QUEUED', 'CALLING', 'PROCESSING')
     ORDER BY is_priority DESC, queue_position ASC, created_at ASC`,
    [counterId]
  );
  return rows.map(mapTicket);
}

async function listTailQueued(client, counterId, limit) {
  const { rows } = await client.query(
    `SELECT * FROM tickets WHERE counter_id = ? AND status = 'QUEUED'
     ORDER BY is_priority ASC, queue_position DESC, created_at DESC
     LIMIT ? FOR UPDATE`,
    [counterId, limit]
  );
  return rows.map(mapTicket);
}

async function reassignCounter(client, ticketId, newCounterId, newQueuePosition) {
  await client.query(
    `UPDATE tickets SET counter_id = ?, queue_position = ? WHERE id = ?`,
    [newCounterId, newQueuePosition, ticketId]
  );
  return findTicketById(client, ticketId);
}

async function findExpiredForPurge(client, cutoffTimestamp) {
  const { rows } = await client.query(
    `SELECT * FROM tickets WHERE status = 'QUEUED' AND created_at < ? FOR UPDATE`,
    [cutoffTimestamp]
  );
  return rows.map(mapTicket);
}

async function findAllQueuedAndCallingForEOD(client) {
  const { rows } = await client.query(
    `SELECT * FROM tickets WHERE status IN ('QUEUED', 'CALLING') FOR UPDATE`
  );
  return rows.map(mapTicket);
}

// Danh sach ve dung cho UI chon nhanh tren Admin Control Tower (Emergency Skip / Khoi phuc
// Ve huy nham) - hien thi theo So thu tu + Quay thay vi bat Admin phai go tay UUID Ticket ID
// hay nhap Ho ten/SDT cong dan. Gom ca trang thai dang hoat dong (co the Emergency Skip) va
// CANCELLED trong ngay (co the Khoi phuc); server van tu tham dinh dung trang thai khi thao tac.
async function listActionableForAdmin(client) {
  const { rows } = await client.query(
    `SELECT t.id, t.ticket_number, t.status, t.is_priority, t.created_at,
            c.code AS counter_code, c.name AS counter_name
     FROM tickets t
     LEFT JOIN counters c ON c.id = t.counter_id
     WHERE t.status IN ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','CANCELLED')
       AND t.created_at >= CURRENT_DATE
     ORDER BY t.created_at DESC
     LIMIT 200`
  );
  return rows;
}

async function countTodayByField(client, fieldId) {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM tickets t
     JOIN services s ON s.id = t.service_id
     WHERE s.field_id = ? AND DATE(t.created_at) = CURRENT_DATE`,
    [fieldId]
  );
  return Number(rows[0].cnt);
}

module.exports = {
  insertTicket, lockTicketById, findTicketById, findByReentryToken,
  findNextQueuedForCounter, countActiveForCounter, maxQueuePositionForCounter,
  updateStatus, insertHistory, listQueueForCounter, listTailQueued, listActionableForAdmin,
  reassignCounter, findExpiredForPurge, findAllQueuedAndCallingForEOD, countTodayByField
};
