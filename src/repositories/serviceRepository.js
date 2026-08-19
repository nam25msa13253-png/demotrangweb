const { parseJson } = require('../utils/json');

function mapService(row) {
  if (!row) return null;
  return { ...row, required_docs: parseJson(row.required_docs) };
}

async function listFields(client) {
  const { rows } = await client.query('SELECT * FROM service_fields ORDER BY id ASC');
  return rows;
}

async function listServices(client) {
  const { rows } = await client.query(
    `SELECT s.*, sf.name AS field_name, sf.code AS field_code, sf.ticket_prefix
     FROM services s JOIN service_fields sf ON sf.id = s.field_id
     WHERE s.is_active = 1 ORDER BY s.name ASC`
  );
  return rows.map(mapService);
}

async function findServiceById(client, serviceId) {
  const { rows } = await client.query(
    `SELECT s.*, sf.name AS field_name, sf.ticket_prefix, sf.id AS field_id
     FROM services s JOIN service_fields sf ON sf.id = s.field_id
     WHERE s.id = ?`,
    [serviceId]
  );
  return mapService(rows[0]);
}

// MySQL/MariaDB: collation mac dinh (vd utf8mb4_unicode_ci) da khong phan biet hoa/thuong,
// nen dung LIKE thuong (tuong duong ILIKE cua PostgreSQL).
async function searchServices(client, keyword) {
  const { rows } = await client.query(
    `SELECT s.*, sf.name AS field_name, sf.code AS field_code FROM services s
     JOIN service_fields sf ON sf.id = s.field_id
     WHERE s.is_active = 1 AND (s.name LIKE ? OR s.short_alias LIKE ? OR s.code LIKE ?)
     ORDER BY s.name ASC LIMIT 20`,
    [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
  );
  return rows.map(mapService);
}

module.exports = { listFields, listServices, findServiceById, searchServices };
