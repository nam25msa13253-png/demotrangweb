-- =====================================================================================
-- SMART PUBLIC ADMINISTRATIVE QUEUE & KIOSK DISPATCHER SYSTEM
-- Schema chuan hoa 3NF cho PostgreSQL (dung cho Render Postgres managed hoac Postgres local).
--
-- Luu y: ban nay thay the hoan toan ban MySQL/MariaDB cu (XAMPP) - du an da chuyen han
-- sang Postgres de trien khai don gian tren Render (Postgres managed, wire tu dong qua
-- render.yaml, khong can TCP Proxy/SSL thu cong nhu MySQL ngoai).
--
-- Khac MySQL: khong con DROP/CREATE DATABASE + USE o dau file - Postgres managed (Render/
-- Railway/Aiven...) da cap san 1 database rieng, user ung dung thuong khong co quyen
-- DROP/CREATE DATABASE. Chay thang script nay vao database da duoc cap la du.
-- =====================================================================================

-- ---------------------------------------------------------------------------
-- Ham dung chung: tu dong cap nhat cot updated_at moi khi UPDATE 1 dong
-- (thay the "ON UPDATE CURRENT_TIMESTAMP" cua MySQL - Postgres khong co san cu phap nay).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- service_fields: linh vuc chuyen mon (Ho tich, Dat dai, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE service_fields (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  ticket_prefix CHAR(1) NOT NULL UNIQUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- staff: tai khoan he thong (Admin + Can bo quay). RBAC theo role.
-- id la UUID (CHAR(36)) sinh boi ung dung (crypto.randomUUID()).
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id            CHAR(36) PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  username      VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN','MANAGER','SUPERVISOR','OFFICER')),
  is_active     SMALLINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- services: danh muc thu tuc hanh chinh
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  field_id          INT NOT NULL REFERENCES service_fields(id),
  code              VARCHAR(30) NOT NULL UNIQUE,
  name              VARCHAR(255) NOT NULL,
  short_alias       VARCHAR(80),
  sla_minutes       INT NOT NULL DEFAULT 25,
  fee_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  required_docs     JSONB NOT NULL,
  is_active         SMALLINT NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- counters: danh sach quay giao dich
-- ---------------------------------------------------------------------------
CREATE TABLE counters (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- VARCHAR(60) (khong phai 20) vi khi "xoa" (soft-delete) 1 quay, ma quay goc duoc doi
  -- sang dang luu tru VD "QUAY-06-DEL-1735000000000" de giai phong ma quay cho lan tao moi.
  code             VARCHAR(60) NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  field_id         INT NOT NULL REFERENCES service_fields(id),
  officer_id       CHAR(36) REFERENCES staff(id),
  status           VARCHAR(10) NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN','PAUSED','CLOSED')),
  active_ticket_id CHAR(36),
  -- Soft-delete: "xoa" quay tren Admin Dashboard chi danh dau co nay = 1 (khong DELETE that
  -- dong), de tickets/ticket_status_history van tham chieu duoc toi quay (bao toan Audit Trail)
  -- ma quay van bien mat khoi moi danh sach dang hoat dong. Xem counterRepository.js.
  is_deleted       SMALLINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_counters_is_deleted ON counters (is_deleted);

CREATE TRIGGER trg_counters_updated_at BEFORE UPDATE ON counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- form_templates: CSDL to khai mau & vi tri khay/ke phoi giay vat ly
-- ---------------------------------------------------------------------------
CREATE TABLE form_templates (
  id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id            INT NOT NULL REFERENCES services(id),
  form_code             VARCHAR(30) NOT NULL UNIQUE,
  form_name             VARCHAR(255) NOT NULL,
  shelf_name            VARCHAR(60) NOT NULL,
  tray_number           VARCHAR(20) NOT NULL,
  desk_area             VARCHAR(60) NOT NULL,
  annotated_sample_url  VARCHAR(500),
  qr_code_url           VARCHAR(500),
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- priority_reasons: danh muc ly do uu tien CUNG (chong lam quyen chen VIP)
-- ---------------------------------------------------------------------------
CREATE TABLE priority_reasons (
  id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(150) NOT NULL
);

INSERT INTO priority_reasons (code, label) VALUES
  ('ELDERLY_80', 'Người già trên 80 tuổi'),
  ('VETERAN', 'Thương binh / Người có công'),
  ('PREGNANT', 'Phụ nữ mang thai'),
  ('EMERGENCY', 'Trường hợp khẩn cấp');

-- ---------------------------------------------------------------------------
-- tickets: trung tam cua he thong hang doi (State Machine). id la UUID app-generated.
-- ---------------------------------------------------------------------------
CREATE TABLE tickets (
  id                 CHAR(36) PRIMARY KEY,
  ticket_number      VARCHAR(20) NOT NULL,
  service_id         INT NOT NULL REFERENCES services(id),
  counter_id         INT REFERENCES counters(id),
  citizen_name       VARCHAR(150) NOT NULL,
  phone              VARCHAR(20),
  status             VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
                       CHECK (status IN ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD')),
  retry_count        INT NOT NULL DEFAULT 0,
  is_priority        SMALLINT NOT NULL DEFAULT 0,
  priority_reason_id INT REFERENCES priority_reasons(id),
  queue_position     INT,
  missing_doc_codes  JSONB,
  reentry_qr_token   VARCHAR(64) UNIQUE,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at          TIMESTAMP,
  processing_at      TIMESTAMP,
  completed_at       TIMESTAMP,
  cancelled_at       TIMESTAMP,
  handling_duration_seconds INT,
  sla_status         VARCHAR(10)
);

ALTER TABLE counters
  ADD CONSTRAINT fk_counters_active_ticket
  FOREIGN KEY (active_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- system_configs: Bo Cau Hinh Tham So Nghiep Vu Dong (key-value + bien do an toan)
-- ---------------------------------------------------------------------------
CREATE TABLE system_configs (
  config_key    VARCHAR(60) PRIMARY KEY,
  config_value  VARCHAR(255) NOT NULL,
  value_type    VARCHAR(20) NOT NULL DEFAULT 'NUMBER',
  min_bound     DECIMAL(10,2),
  max_bound     DECIMAL(10,2),
  description   VARCHAR(255),
  updated_by    CHAR(36) REFERENCES staff(id),
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_system_configs_updated_at BEFORE UPDATE ON system_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO system_configs (config_key, config_value, value_type, min_bound, max_bound, description) VALUES
  ('CALL_TIMEOUT_SECONDS', '45', 'NUMBER', 30, 120, 'Thời gian đếm ngược chờ công dân có mặt sau khi gọi số'),
  ('MAX_RETRY_COUNT', '3', 'NUMBER', 1, 5, 'Số lần nhắc vắng tối đa trước khi 3-Strike Drop'),
  ('MAX_TICKET_LIFETIME_MINUTES', '120', 'NUMBER', 30, 480, 'Thời gian sống tối đa của vé vắng mặt trước khi EXPIRED'),
  ('UNDO_BUFFER_SECONDS', '5', 'NUMBER', 0, 10, 'Thời gian đệm cho phép hoàn tác nút Hoàn tất'),
  ('AUDIO_GAP_SECONDS', '1.5', 'NUMBER', 0.5, 3, 'Khoảng lặng giữa 2 bản tin loa TTS'),
  ('QUEUE_LENGTH_ALERT', '8', 'NUMBER', 1, 50, 'Ngưỡng cảnh báo độ dài hàng đợi (Heatmap Đỏ)'),
  ('AHT_ALERT_MINUTES', '25', 'NUMBER', 1, 120, 'Ngưỡng cảnh báo thời gian xử lý'),
  ('AWT_ALERT_MINUTES', '35', 'NUMBER', 1, 120, 'Ngưỡng cảnh báo thời gian chờ đợi (Heatmap Đỏ)'),
  ('QUEUE_HEATMAP_YELLOW_MIN', '4', 'NUMBER', 1, 50, 'Ngưỡng dưới mức Vàng'),
  ('EOD_PURGE_HOUR', '17', 'NUMBER', 0, 23, 'Giờ kích hoạt Batch Purge cuối ngày'),
  ('TTS_VOICE', 'vi-VN-Standard-A', 'STRING', NULL, NULL, 'Giọng đọc TTS mặc định (Nữ MB)'),
  ('TTS_SPEED', '1.0', 'NUMBER', 0.5, 2.0, 'Tốc độ đọc loa'),
  ('TTS_VOLUME', '85', 'NUMBER', 0, 100, 'Âm lượng mặc định (%)');

-- ---------------------------------------------------------------------------
-- audit_logs: Nhat Ky Kiem Toan - append-only (rang buoc "khong sua/xoa" duoc dam bao
-- o tang ung dung: auditRepository.js chi co insertLog/listRecent).
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id     CHAR(36) REFERENCES staff(id),
  action       VARCHAR(60) NOT NULL,
  target_type  VARCHAR(30) NOT NULL,
  target_id    VARCHAR(60),
  reason       VARCHAR(255),
  payload      JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- ticket_status_history: System Log chi tiet cho tung buoc chuyen trang thai ve
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_status_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id   CHAR(36) NOT NULL REFERENCES tickets(id),
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  counter_id  INT REFERENCES counters(id),
  officer_id  CHAR(36) REFERENCES staff(id),
  event_data  JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- device_health: theo doi Kiosk / Loa PA / LED
-- ---------------------------------------------------------------------------
CREATE TABLE device_health (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_type       VARCHAR(20) NOT NULL CHECK (device_type IN ('KIOSK','PA_SPEAKER','LED_BOARD')),
  device_code       VARCHAR(60) NOT NULL,
  counter_id        INT REFERENCES counters(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE','OFFLINE','DEGRADED')),
  last_heartbeat_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_device UNIQUE (device_type, device_code)
);

-- =====================================================================================
-- INDEXES toi uu truy van hang doi realtime (theo counter_id + status la truy van nong nhat)
-- =====================================================================================
CREATE INDEX idx_tickets_counter_status ON tickets (counter_id, status);
CREATE INDEX idx_tickets_status_created ON tickets (status, created_at);
CREATE INDEX idx_tickets_service_status ON tickets (service_id, status);
CREATE INDEX idx_counters_field_status ON counters (field_id, status);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_ticket_history_ticket ON ticket_status_history (ticket_id, created_at);

-- =====================================================================================
-- SEED DATA MAU
-- =====================================================================================
INSERT INTO service_fields (code, name, ticket_prefix) VALUES
  ('HOTICH', 'Hộ tịch - Tư pháp', 'A'),
  ('DATDAI', 'Đất đai - Tài nguyên', 'B'),
  ('KINHDOANH', 'Đăng ký Kinh doanh', 'C');

INSERT INTO services (field_id, code, name, short_alias, sla_minutes, fee_amount, required_docs) VALUES
  (1, 'KHAISINH', 'Đăng ký khai sinh', 'khai sinh', 15, 0, '[{"code":"CMND","name":"CCCD/CMND bản chính","mandatory":true},{"code":"GCN_SINH","name":"Giấy chứng sinh","mandatory":true},{"code":"TOKHAI_KS","name":"Tờ khai đăng ký khai sinh","mandatory":true}]'),
  (2, 'SANGTEN', 'Sang tên Giấy chứng nhận Quyền sử dụng đất', 'sang tên sổ đỏ', 30, 500000, '[{"code":"CCCD","name":"CCCD hai bên","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"HDCN","name":"Hợp đồng chuyển nhượng công chứng","mandatory":true},{"code":"TOKHAI_ST","name":"Tờ khai sang tên","mandatory":true}]'),
  (3, 'DKKD_HKD', 'Đăng ký Hộ kinh doanh', 'đăng ký hộ kinh doanh', 20, 100000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TOKHAI_HKD","name":"Tờ khai đăng ký hộ kinh doanh","mandatory":true}]');

-- Mo rong danh muc thu tuc (ngoai 3 thu tuc mau ban dau) de bao phu day du hon cac thu tuc
-- pho bien theo tung linh vuc - dung cho Chen Luot Uu tien va tra cuu Kiosk/Trang chu.
INSERT INTO services (field_id, code, name, short_alias, sla_minutes, fee_amount, required_docs) VALUES
  (1, 'KETHON', 'Đăng ký kết hôn', 'đăng ký kết hôn', 20, 0, '[{"code":"CCCD","name":"CCCD hai bên","mandatory":true},{"code":"XNTTHN","name":"Giấy xác nhận tình trạng hôn nhân","mandatory":true},{"code":"TOKHAI_KH","name":"Tờ khai đăng ký kết hôn","mandatory":true}]'),
  (1, 'KHAITU', 'Đăng ký khai tử', 'khai tử', 15, 0, '[{"code":"CCCD","name":"CCCD người khai","mandatory":true},{"code":"GIAYBAOTU","name":"Giấy báo tử","mandatory":true},{"code":"TOKHAI_KT","name":"Tờ khai đăng ký khai tử","mandatory":true}]'),
  (1, 'XNTTHN', 'Xác nhận tình trạng hôn nhân', 'xác nhận độc thân', 15, 0, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TOKHAI_XNHN","name":"Tờ khai xác nhận tình trạng hôn nhân","mandatory":true}]'),
  (1, 'CAICHINH_HT', 'Cải chính hộ tịch', 'cải chính hộ tịch', 25, 0, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GIAYTOCHUNGMINH","name":"Giấy tờ chứng minh nội dung cải chính","mandatory":true},{"code":"TOKHAI_CC","name":"Tờ khai cải chính hộ tịch","mandatory":true}]'),
  (2, 'CAPMOI_GCN', 'Cấp mới Giấy chứng nhận Quyền sử dụng đất', 'cấp mới sổ đỏ', 30, 500000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"NGUONGOCDAT","name":"Giấy tờ nguồn gốc đất","mandatory":true},{"code":"TOKHAI_DKDD","name":"Tờ khai đăng ký đất đai","mandatory":true}]'),
  (2, 'TACHTHUA', 'Tách thửa đất', 'tách thửa', 30, 300000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"SODOTACHTHUA","name":"Sơ đồ tách thửa","mandatory":true},{"code":"TOKHAI_TT","name":"Tờ khai tách thửa","mandatory":true}]'),
  (2, 'CHUYENMDSDD', 'Chuyển mục đích sử dụng đất', 'chuyển mục đích sử dụng đất', 30, 500000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"TOKHAI_CMD","name":"Tờ khai chuyển mục đích sử dụng đất","mandatory":true}]'),
  (3, 'THAYDOI_DKKD', 'Thay đổi nội dung Đăng ký Kinh doanh', 'thay đổi đăng ký kinh doanh', 20, 100000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNDKKD_CU","name":"Giấy chứng nhận ĐKKD cũ","mandatory":true},{"code":"TOKHAI_TDDKKD","name":"Tờ khai thay đổi nội dung ĐKKD","mandatory":true}]'),
  (3, 'TAMNGUNG_KD', 'Tạm ngừng kinh doanh', 'tạm ngừng kinh doanh', 15, 0, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TBTAMNGUNG","name":"Thông báo tạm ngừng kinh doanh","mandatory":true}]'),
  (3, 'GIAITHE_HKD', 'Giải thể Hộ kinh doanh', 'giải thể hộ kinh doanh', 20, 0, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNDKKD","name":"Giấy chứng nhận ĐKKD bản chính","mandatory":true},{"code":"TOKHAI_GT","name":"Tờ khai giải thể hộ kinh doanh","mandatory":true}]'),
  (1, 'TRICHLUC_HT', 'Trích lục hộ tịch', 'trích lục hộ tịch', 15, 8000, '[{"code":"CCCD","name":"CCCD/CMND bản chính người yêu cầu","mandatory":true},{"code":"TOKHAI_TLHT","name":"Tờ khai yêu cầu cấp bản sao trích lục hộ tịch","mandatory":true},{"code":"THONGTIN_SUKIEN","name":"Thông tin sự kiện hộ tịch đã đăng ký (số, quyển, ngày đăng ký nếu có)","mandatory":false}]');

INSERT INTO counters (code, name, field_id, status) VALUES
  ('QUAY-01', 'Quầy 01', 1, 'CLOSED'),
  ('QUAY-02', 'Quầy 02', 1, 'CLOSED'),
  ('QUAY-03', 'Quầy 03', 2, 'CLOSED'),
  ('QUAY-04', 'Quầy 04', 2, 'CLOSED'),
  ('QUAY-05', 'Quầy 05', 3, 'CLOSED');

INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url) VALUES
  (1, 'TK-KS-01', 'Tờ khai đăng ký khai sinh', 'Kệ A', 'Khay 1', 'Khu Bàn viết A', '/assets/samples/tk-ks-01.png'),
  (2, 'TK-ST-01', 'Tờ khai sang tên QSDD', 'Kệ B', 'Khay 2', 'Khu Bàn viết B', '/assets/samples/tk-st-01.png'),
  (3, 'TK-HKD-01', 'Tờ khai đăng ký hộ kinh doanh', 'Kệ C', 'Khay 1', 'Khu Bàn viết C', '/assets/samples/tk-hkd-01.png'),
  ((SELECT id FROM services WHERE code = 'TRICHLUC_HT'), 'TK-TLHT-01', 'Tờ khai yêu cầu cấp bản sao trích lục hộ tịch', 'Kệ A', 'Khay 2', 'Khu Bàn viết A', '/assets/samples/tk-tlht-01.png');

-- Tai khoan mau (password cho tat ca: "changeme" - DOI MAT KHAU that truoc khi trien khai production)
-- Postgres khong co san ham UUID() nhu MySQL (can extension pgcrypto/uuid-ossp) - dung
-- literal UUID co dinh cho du du 4 tai khoan mau, tranh phu thuoc extension tren managed DB.
INSERT INTO staff (id, full_name, username, password_hash, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Super Admin', 'superadmin', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPER_ADMIN'),
  ('22222222-2222-4222-8222-222222222222', 'Trưởng Trung tâm', 'manager01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'MANAGER'),
  ('33333333-3333-4333-8333-333333333333', 'Cán bộ Điều phối', 'supervisor01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPERVISOR'),
  ('44444444-4444-4444-8444-444444444444', 'Cán bộ Quầy 01', 'officer01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'OFFICER');

-- Gan Can bo Quay 01 phu trach QUAY-01 va mo quay san cho demo
UPDATE counters SET officer_id = (SELECT id FROM staff WHERE username = 'officer01'), status = 'OPEN'
WHERE code = 'QUAY-01';
