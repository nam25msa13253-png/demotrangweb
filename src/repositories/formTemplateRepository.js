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

async function upsert(client, { id, serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl }) {
  if (id) {
    await client.query(
      `UPDATE form_templates SET service_id=?, form_code=?, form_name=?, shelf_name=?,
       tray_number=?, desk_area=?, annotated_sample_url=?, qr_code_url=? WHERE id=?`,
      [serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl, id]
    );
    return findById(client, id);
  }
  const { rows: inserted } = await client.query(
    `INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url, qr_code_url)
     VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
    [serviceId, formCode, formName, shelfName, trayNumber, deskArea, annotatedSampleUrl, qrCodeUrl]
  );
  return findById(client, inserted[0].id);
}

module.exports = { findByServiceId, findById, listAll, upsert };
