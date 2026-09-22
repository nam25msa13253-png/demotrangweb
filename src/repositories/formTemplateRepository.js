async function findByServiceId(client, serviceId) {
  const { rows } = await client.query('SELECT * FROM form_templates WHERE service_id = ?', [serviceId]);
  return rows[0] || null;
}

async function findById(client, id) {
  const { rows } = await client.query('SELECT * FROM form_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function listAll(client) {
  const { rows } = await client.query(
    `SELECT ft.*, s.name AS service_name FROM form_templates ft
     JOIN services s ON s.id = ft.service_id ORDER BY ft.id ASC`
  );
  return rows;
}

// fillGuide (JSON huong dan dien to khai, xem src/data/formGuides.js): undefined = giu nguyen
// gia tri cu khi UPDATE (Admin chi sua vi tri ke/khay khong bi xoa mat huong dan), null = xoa.
function serializeFillGuide(fillGuide) {
  return fillGuide === null ? null : JSON.stringify(fillGuide);
}

async function upsert(client, { id, serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl, fillGuide }) {
  if (id) {
    await client.query(
      `UPDATE form_templates SET service_id=?, form_code=?, form_name=?, shelf_name=?,
       tray_number=?, desk_area=?, annotated_sample_url=?, qr_code_url=?,
       fill_guide = CASE WHEN ? THEN ?::jsonb ELSE fill_guide END WHERE id=?`,
      [serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl,
        fillGuide !== undefined, fillGuide === undefined ? null : serializeFillGuide(fillGuide), id]
    );
    return findById(client, id);
  }
  const { rows: inserted } = await client.query(
    `INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url, qr_code_url, fill_guide)
     VALUES (?,?,?,?,?,?,?,?,?::jsonb) RETURNING id`,
    [serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl,
      fillGuide === undefined ? null : serializeFillGuide(fillGuide)]
  );
  return findById(client, inserted[0].id);
}

// Danh sach to khai (khong keo theo noi dung fill_guide dai) cho trang huong dan dien mau.
async function listWithGuide(client) {
  const { rows } = await client.query(
    `SELECT ft.id, ft.service_id, ft.form_code, ft.form_name, s.name AS service_name, s.short_alias
     FROM form_templates ft JOIN services s ON s.id = ft.service_id
     WHERE s.is_active = 1 AND ft.fill_guide IS NOT NULL ORDER BY s.name ASC`
  );
  return rows;
}

module.exports = { findByServiceId, findById, listAll, listWithGuide, upsert };
