// Migration cong them, chay tu dong moi lan server khoi dong (idempotent - an toan chay lai
// nhieu lan). Dung cho cac thay doi schema/seed data phat sinh SAU khi CSDL production tren
// Render da duoc khoi tao tu db/schema.sql (schema.sql chi chay 1 lan qua db/init.js nen
// khong tu cap nhat CSDL da ton tai - can co buoc migrate rieng nay).
const { pool } = require('../config/db');
const { FORM_GUIDES } = require('../data/formGuides');

async function addSoftDeleteToCounters() {
  // Cho phep "xoa" quay ma khong pha vo FK Audit Trail (tickets/ticket_status_history van
  // tham chieu duoc toi dong quay). Quay bi xoa duoc an khoi moi truy van danh sach dang hoat dong.
  await pool.query(`ALTER TABLE counters ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_counters_is_deleted ON counters (is_deleted)`);

  // Ma quay luu tru khi soft-delete (VD "QUAY-06-DEL-1735000000000") dai hon 20 ky tu - mo
  // rong cot de tranh loi "value too long". CHI chay ALTER neu cot chua du rong: tu khi co
  // VIEW active_counters (SELECT * FROM counters, xem addActiveCountersView ben duoi),
  // Postgres KHONG cho phep ALTER COLUMN TYPE tren 1 cot dang co view phu thuoc - DU LA DOI
  // SANG DUNG KIEU NO DANG CO (bao gio cung bi tu choi voi loi "cannot alter type of a column
  // used by a view or rule"). Neu chay ALTER nay vo dieu kien moi lan khoi dong nhu truoc day,
  // lan dau (khi view chua ton tai) van thanh cong, nhung TU LAN KHOI DONG THU 2 tro di (sau
  // khi view da duoc tao) se LUON LUON CRASH server ngay tu buoc migrate - day la loi that da
  // xay ra tren Render (server khong bao gio khoi dong lai duoc sau lan deploy dau tien tao
  // xong view).
  const { rows } = await pool.query(
    `SELECT character_maximum_length FROM information_schema.columns
     WHERE table_name = 'counters' AND column_name = 'code'`
  );
  const currentLength = rows[0] && rows[0].character_maximum_length;
  if (currentLength === null || currentLength === undefined || currentLength < 60) {
    await pool.query(`ALTER TABLE counters ALTER COLUMN code TYPE VARCHAR(60)`);
  }
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

// VIEW dung chung cho MOI truy van CHI DOC (bao cao/hien thi) can liet ke quay: tap trung
// dieu kien "is_deleted = 0" o DUY NHAT 1 cho thay vi lap lai WHERE c.is_deleted = 0 o tung
// query rieng le - da co lan quen filter nay o 4 noi khac nhau (Heatmap, Bang LED, Kiosk,
// Chatbot grounding) khien quay da xoa mem van hien ra. Cac thao tac GHI (INSERT/UPDATE/
// SELECT...FOR UPDATE trong transaction nghiep vu) van dung bang goc `counters` nhu cu qua
// counterRepository.js - VIEW nay chi danh cho doc du lieu bao cao/hien thi.
async function addActiveCountersView() {
  await pool.query(`CREATE OR REPLACE VIEW active_counters AS SELECT * FROM counters WHERE is_deleted = 0`);
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

async function addAccountSecurityFields() {
  // Khoa tam thoi tai khoan sau nhieu lan dang nhap sai lien tiep (chong brute-force theo
  // tung tai khoan) + bat buoc doi mat khau (mat khau Admin vua cap lai, hoac mat khau mau
  // "changeme" trong seed data - xem UPDATE ben duoi). Xem src/services/authService.js.
  await pool.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS failed_login_attempts SMALLINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`);
  await pool.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change_password SMALLINT NOT NULL DEFAULT 0`);

  // Bat ky tai khoan nao (ke ca tai khoan Admin tu tao sau nay, khong chi 4 tai khoan mau)
  // dang dung DUNG hash cua mat khau mau "changeme" trong db/schema.sql deu bi danh dau bat
  // buoc doi mat khau ngay lan dang nhap ke tiep - hash nay la CONG KHAI (nam san trong repo)
  // nen tai khoan nao con dung se co nguy co bi chiem quyen ngay lap tuc neu khong doi.
  await pool.query(
    `UPDATE staff SET must_change_password = 1
     WHERE password_hash = '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru'`
  );
}

// Huong dan dien giay to cho nguoi dan: them cot fill_guide (JSONB) vao form_templates, tao them
// to khai cho cac thu tuc chua co, va nap noi dung huong dan mac dinh tu src/data/formGuides.js.
// CHI ghi vao dong co fill_guide IS NULL - noi dung Admin da tu sua se khong bi ghi de moi lan
// khoi dong lai server.
async function addFormFillGuides() {
  await pool.query(`ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS fill_guide JSONB`);

  for (const g of FORM_GUIDES) {
    const { rows } = await pool.query(`SELECT id FROM services WHERE code = ?`, [g.serviceCode]);
    if (!rows[0]) continue;

    await pool.query(
      `INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area)
       SELECT ?::int, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE form_code = ? OR service_id = ?)`,
      [rows[0].id, g.formCode, g.formName, g.shelf, g.tray, g.desk, g.formCode, rows[0].id]
    );

    const guide = { docCode: g.docCode, intro: g.intro, fields: g.fields, mistakes: g.mistakes, after: g.after };
    await pool.query(
      `UPDATE form_templates SET fill_guide = ?::jsonb WHERE service_id = ? AND fill_guide IS NULL`,
      [JSON.stringify(guide), rows[0].id]
    );
  }
}

// Ve lay so tai Kiosk khong con thu thap ho ten (xem kioskRoutes.js, POST /tickets): cho phep
// citizen_name NULL va don dep ten dat cho "Khach tai Kiosk" cu de khong con hien tren man hinh.
async function makeCitizenNameOptional() {
  await pool.query(`ALTER TABLE tickets ALTER COLUMN citizen_name DROP NOT NULL`);
  await pool.query(`UPDATE tickets SET citizen_name = NULL WHERE citizen_name = 'Khách tại Kiosk'`);
}

// Cong tac + gio mo cua Kiosk cap so (xem src/services/kioskHours.js) va kieu bao mat Wi-Fi cho
// ma QR (WPA/WEP/nopass). Gia tri gio la GIA TRI MAU - Admin can sua theo gio that cua Trung tam.
async function addKioskHoursAndWifiSecurityConfigs() {
  await pool.query(`
    INSERT INTO system_configs (config_key, config_value, value_type, min_bound, max_bound, description) VALUES
      ('KIOSK_HOURS_ENFORCED', '1', 'NUMBER', 0, 1, 'Chan cap so tai Kiosk ngoai gio lam viec: 1 = chan, 0 = khong chan (dat 0 khi co buoi dao tao ngoai gio)'),
      ('KIOSK_OPEN_TIME', '07:30', 'STRING', NULL, NULL, 'Gio mo cua (HH:MM, gio Viet Nam). GIA TRI MAU - chua xac thuc voi Trung tam, hay sua cho dung'),
      ('KIOSK_CLOSE_TIME', '17:00', 'STRING', NULL, NULL, 'Gio dong cua (HH:MM, gio Viet Nam). GIA TRI MAU - chua xac thuc voi Trung tam, hay sua cho dung'),
      ('KIOSK_WORKING_DAYS', '1,2,3,4,5', 'STRING', NULL, NULL, 'Cac ngay lam viec: 1=Thu Hai ... 7=Chu nhat, cach nhau bang dau phay. GIA TRI MAU - chua xac thuc'),
      ('WIFI_SECURITY', 'WPA', 'STRING', NULL, NULL, 'Kieu bao mat Wi-Fi de tao ma QR: WPA (WPA/WPA2/WPA3 ca nhan), WEP hoac nopass (mang mo)')
    ON CONFLICT (config_key) DO NOTHING
  `);
}

async function run() {
  await addSoftDeleteToCounters();
  await addTrichLucHoTichService();
  await addStaffSessionsTable();
  await addActiveCountersView();
  await addWifiConfig();
  await addAccountSecurityFields();
  await addFormFillGuides();
  await makeCitizenNameOptional();
  await addKioskHoursAndWifiSecurityConfigs();
}

module.exports = { run, addSoftDeleteToCounters };
