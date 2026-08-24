// Migration cong them, chay tu dong moi lan server khoi dong (idempotent - an toan chay lai
// nhieu lan). Dung cho cac thay doi schema/seed data phat sinh SAU khi CSDL production tren
// Render da duoc khoi tao tu db/schema.sql (schema.sql chi chay 1 lan qua db/init.js nen
// khong tu cap nhat CSDL da ton tai - can co buoc migrate rieng nay).
const { pool } = require('../config/db');

async function addSoftDeleteToCounters() {
  // Cho phep "xoa" quay ma khong pha vo FK Audit Trail (tickets/ticket_status_history van
  // tham chieu duoc toi dong quay). Quay bi xoa duoc an khoi moi truy van danh sach dang hoat dong.
  await pool.query(`ALTER TABLE counters ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_counters_is_deleted ON counters (is_deleted)`);
  // Ma quay luu tru khi soft-delete (VD "QUAY-06-DEL-1735000000000") dai hon 20 ky tu -
  // mo rong cot de tranh loi "value too long". An toan, khong can rewrite bang.
  await pool.query(`ALTER TABLE counters ALTER COLUMN code TYPE VARCHAR(60)`);
}

async function addTrichLucHoTichService() {
  const { rows } = await pool.query(`SELECT id FROM services WHERE code = 'TRICHLUC_HT'`);
  if (rows.length > 0) return;

  const { rows: fieldRows } = await pool.query(`SELECT id FROM service_fields WHERE code = 'HOTICH'`);
  const fieldId = fieldRows[0] && fieldRows[0].id;
  if (!fieldId) return;

  const requiredDocs = JSON.stringify([
    { code: 'CCCD', name: 'CCCD/CMND bản chính người yêu cầu', mandatory: true },
    { code: 'TOKHAI_TLHT', name: 'Tờ khai yêu cầu cấp bản sao trích lục hộ tịch', mandatory: true },
    { code: 'THONGTIN_SUKIEN', name: 'Thông tin sự kiện hộ tịch đã đăng ký (số, quyển, ngày đăng ký nếu có)', mandatory: false }
  ]);

  const { rows: inserted } = await pool.query(
    `INSERT INTO services (field_id, code, name, short_alias, sla_minutes, fee_amount, required_docs)
     VALUES (?, 'TRICHLUC_HT', 'Trích lục hộ tịch', 'trích lục hộ tịch', 15, 8000, ?) RETURNING id`,
    [fieldId, requiredDocs]
  );

  const serviceId = inserted[0] && inserted[0].id;
  if (serviceId) {
    await pool.query(
      `INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url)
       VALUES (?, 'TK-TLHT-01', 'Tờ khai yêu cầu cấp bản sao trích lục hộ tịch', 'Kệ A', 'Khay 2', 'Khu Bàn viết A', '/assets/samples/tk-tlht-01.png')`,
      [serviceId]
    );
  }
}

async function addStaffSessionsTable() {
  // Chuyen phien dang nhap tu Map trong bo nho (mat het khi server restart/deploy lai -
  // Render free tier hay restart) sang luu trong chinh Postgres da co san, khong can them
  // Redis/dich vu moi. Xem src/services/authService.js.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_sessions (
      token       CHAR(64) PRIMARY KEY,
      staff_id    CHAR(36) NOT NULL REFERENCES staff(id),
      role        VARCHAR(20) NOT NULL,
      full_name   VARCHAR(150) NOT NULL,
      expires_at  TIMESTAMP NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON staff_sessions (expires_at)`);
}

async function addWifiConfig() {
  // SSID/mat khau Wi-Fi hien la hang-code trong kioskRoutes.js - chuyen sang system_configs
  // de Admin tu cap nhat dung mang Wi-Fi THAT tai co so ngay tren Dashboard (tab "Cau hinh
  // Tham so"), khong can sua code/deploy lai. Luu y: server chay tren Render (cloud) nen
  // KHONG the tu do mang Wi-Fi vat ly tai tru so - gia tri nay bat buoc phai duoc nguoi quan
  // tri nhap tay 1 lan cho dung voi mang that cua co so.
  await pool.query(`
    INSERT INTO system_configs (config_key, config_value, value_type, description) VALUES
      ('WIFI_SSID', 'MOTCUA-FREE-WIFI', 'STRING', 'Ten mang Wi-Fi (SSID) thuc te tai co so - sua theo dung mang that, hien tren man hinh Kiosk'),
      ('WIFI_PASSWORD', 'hanhchinh2026', 'STRING', 'Mat khau Wi-Fi thuc te tai co so - sua theo dung mat khau that, hien tren man hinh Kiosk')
    ON CONFLICT (config_key) DO NOTHING
  `);
}

async function run() {
  await addSoftDeleteToCounters();
  await addTrichLucHoTichService();
  await addStaffSessionsTable();
  await addWifiConfig();
}

module.exports = { run };
