-- =====================================================================================
-- SMART PUBLIC ADMINISTRATIVE QUEUE & KIOSK DISPATCHER SYSTEM
-- Schema chuan hoa 3NF cho MySQL / MariaDB (da test tren MariaDB 10.4 - XAMPP)
-- Luu y: MariaDB 10.4 KHONG ho tro RETURNING / SKIP LOCKED / FILTER(WHERE..)
--        => id duoc sinh o phia ung dung (UUID), doc du lieu bang SELECT rieng sau INSERT/UPDATE.
--
-- CANH BAO: File nay XOA SACH database `smart_queue` cu (neu co) roi tao lai tu dau.
-- An toan de dan nguyen file vao tab SQL cua phpMyAdmin bat ky luc nao muon lam sach du
-- lieu va chay lai tu dau - nhung se MAT toan bo du lieu dang co trong `smart_queue`.
-- =====================================================================================

DROP DATABASE IF EXISTS smart_queue;
CREATE DATABASE smart_queue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_queue;

-- ---------------------------------------------------------------------------
-- service_fields: linh vuc chuyen mon (Ho tich, Dat dai, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE service_fields (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  ticket_prefix CHAR(1) NOT NULL UNIQUE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- staff: tai khoan he thong (Admin + Can bo quay). RBAC theo role.
-- id la UUID (CHAR(36)) sinh boi ung dung (crypto.randomUUID()).
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id            CHAR(36) PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  username      VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('SUPER_ADMIN','MANAGER','SUPERVISOR','OFFICER') NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- services: danh muc thu tuc hanh chinh
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  field_id          INT NOT NULL,
  code              VARCHAR(30) NOT NULL UNIQUE,
  name              VARCHAR(255) NOT NULL,
  short_alias       VARCHAR(80),
  sla_minutes       INT NOT NULL DEFAULT 25,
  fee_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  required_docs     JSON NOT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_services_field FOREIGN KEY (field_id) REFERENCES service_fields(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- counters: danh sach quay giao dich
-- ---------------------------------------------------------------------------
CREATE TABLE counters (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20) NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  field_id         INT NOT NULL,
  officer_id       CHAR(36),
  status           ENUM('OPEN','PAUSED','CLOSED') NOT NULL DEFAULT 'CLOSED',
  active_ticket_id CHAR(36),
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_counters_field FOREIGN KEY (field_id) REFERENCES service_fields(id),
  CONSTRAINT fk_counters_officer FOREIGN KEY (officer_id) REFERENCES staff(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- form_templates: CSDL to khai mau & vi tri khay/ke phoi giay vat ly
-- ---------------------------------------------------------------------------
CREATE TABLE form_templates (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  service_id            INT NOT NULL,
  form_code             VARCHAR(30) NOT NULL UNIQUE,
  form_name             VARCHAR(255) NOT NULL,
  shelf_name            VARCHAR(60) NOT NULL,
  tray_number           VARCHAR(20) NOT NULL,
  desk_area             VARCHAR(60) NOT NULL,
  annotated_sample_url  VARCHAR(500),
  qr_code_url           VARCHAR(500),
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_form_service FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- priority_reasons: danh muc ly do uu tien CUNG (chong lam quyen chen VIP)
-- ---------------------------------------------------------------------------
CREATE TABLE priority_reasons (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

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
  service_id         INT NOT NULL,
  counter_id         INT,
  citizen_name       VARCHAR(150) NOT NULL,
  phone              VARCHAR(20),
  status             ENUM('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD') NOT NULL DEFAULT 'QUEUED',
  retry_count        INT NOT NULL DEFAULT 0,
  is_priority        TINYINT(1) NOT NULL DEFAULT 0,
  priority_reason_id INT,
  queue_position     INT,
  missing_doc_codes  JSON,
  reentry_qr_token   VARCHAR(64) UNIQUE,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at          DATETIME,
  processing_at      DATETIME,
  completed_at       DATETIME,
  cancelled_at       DATETIME,
  handling_duration_seconds INT,
  sla_status         VARCHAR(10),
  CONSTRAINT fk_tickets_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_tickets_counter FOREIGN KEY (counter_id) REFERENCES counters(id),
  CONSTRAINT fk_tickets_priority_reason FOREIGN KEY (priority_reason_id) REFERENCES priority_reasons(id)
) ENGINE=InnoDB;

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
  updated_by    CHAR(36),
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_config_updated_by FOREIGN KEY (updated_by) REFERENCES staff(id)
) ENGINE=InnoDB;

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
-- audit_logs: Nhat Ky Kiem Toan - append-only (tang REVOKE nhu Postgres khong kha thi
-- tren MySQL/MariaDB o cap schema.sql vi phu thuoc user/GRANT rieng cua tung moi truong;
-- rang buoc "khong sua/xoa" duoc dam bao o tang ung dung: auditRepository.js chi co insertLog/listRecent).
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id     CHAR(36),
  action       VARCHAR(60) NOT NULL,
  target_type  VARCHAR(30) NOT NULL,
  target_id    VARCHAR(60),
  reason       VARCHAR(255),
  payload      JSON,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES staff(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ticket_status_history: System Log chi tiet cho tung buoc chuyen trang thai ve
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_status_history (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   CHAR(36) NOT NULL,
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  counter_id  INT,
  officer_id  CHAR(36),
  event_data  JSON,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  CONSTRAINT fk_history_counter FOREIGN KEY (counter_id) REFERENCES counters(id),
  CONSTRAINT fk_history_officer FOREIGN KEY (officer_id) REFERENCES staff(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- device_health: theo doi Kiosk / Loa PA / LED
-- ---------------------------------------------------------------------------
CREATE TABLE device_health (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  device_type       ENUM('KIOSK','PA_SPEAKER','LED_BOARD') NOT NULL,
  device_code       VARCHAR(60) NOT NULL,
  counter_id        INT,
  status            ENUM('ONLINE','OFFLINE','DEGRADED') NOT NULL DEFAULT 'ONLINE',
  last_heartbeat_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device (device_type, device_code),
  CONSTRAINT fk_device_counter FOREIGN KEY (counter_id) REFERENCES counters(id)
) ENGINE=InnoDB;

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
  (3, 'GIAITHE_HKD', 'Giải thể Hộ kinh doanh', 'giải thể hộ kinh doanh', 20, 0, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNDKKD","name":"Giấy chứng nhận ĐKKD bản chính","mandatory":true},{"code":"TOKHAI_GT","name":"Tờ khai giải thể hộ kinh doanh","mandatory":true}]');

INSERT INTO counters (code, name, field_id, status) VALUES
  ('QUAY-01', 'Quầy 01', 1, 'CLOSED'),
  ('QUAY-02', 'Quầy 02', 1, 'CLOSED'),
  ('QUAY-03', 'Quầy 03', 2, 'CLOSED'),
  ('QUAY-04', 'Quầy 04', 2, 'CLOSED'),
  ('QUAY-05', 'Quầy 05', 3, 'CLOSED');

INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url) VALUES
  (1, 'TK-KS-01', 'Tờ khai đăng ký khai sinh', 'Kệ A', 'Khay 1', 'Khu Bàn viết A', '/assets/samples/tk-ks-01.png'),
  (2, 'TK-ST-01', 'Tờ khai sang tên QSDD', 'Kệ B', 'Khay 2', 'Khu Bàn viết B', '/assets/samples/tk-st-01.png'),
  (3, 'TK-HKD-01', 'Tờ khai đăng ký hộ kinh doanh', 'Kệ C', 'Khay 1', 'Khu Bàn viết C', '/assets/samples/tk-hkd-01.png');

-- Tai khoan mau (password cho tat ca: "changeme" - DOI MAT KHAU that truoc khi trien khai production)
INSERT INTO staff (id, full_name, username, password_hash, role) VALUES
  (UUID(), 'Super Admin', 'superadmin', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPER_ADMIN'),
  (UUID(), 'Trưởng Trung tâm', 'manager01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'MANAGER'),
  (UUID(), 'Cán bộ Điều phối', 'supervisor01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPERVISOR'),
  (UUID(), 'Cán bộ Quầy 01', 'officer01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'OFFICER');

-- Gan Can bo Quay 01 phu trach QUAY-01 va mo quay san cho demo
UPDATE counters SET officer_id = (SELECT id FROM staff WHERE username = 'officer01'), status = 'OPEN'
WHERE code = 'QUAY-01';
