-- =====================================================================================
-- MIGRATION 001 - Nâng cấp cơ sở dữ liệu ĐANG CHẠY lên đúng bản db/schema.sql mới
--
-- DÙNG KHI NÀO: database đã có dữ liệu thật, được tạo từ bản schema.sql cũ. File này biến
-- nó thành đúng hình dạng của schema.sql mới mà KHÔNG mất dữ liệu.
-- KHÔNG CẦN chạy file này nếu database còn trống - khi đó chỉ cần chạy db/schema.sql.
--
-- AN TOÀN: toàn bộ nằm trong một giao dịch (BEGIN ... COMMIT). Có bất kỳ câu lệnh nào lỗi
-- thì mọi thay đổi bị huỷ, database trở về nguyên trạng.
-- IDEMPOTENT: chạy lại nhiều lần không lỗi, không nhân bản ràng buộc.
--
-- CÁCH CHẠY:
--   node db/init.js db/migrations/001_upgrade.sql
--   (hoặc dán toàn bộ nội dung file vào psql / PSQL Shell trên Render)
--
-- KHUYẾN NGHỊ: chụp bản sao lưu (snapshot/backup) database trước khi chạy.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 0. Các hàm phụ trợ tạm thời (tự biến mất khi phiên kết nối kết thúc).
--    Dùng để viết các thao tác "chỉ làm nếu chưa có" mà không lặp lại 40 lần.
-- -------------------------------------------------------------------------------------

-- Gỡ khoá ngoại hiện có trên (bảng, cột) bất kể nó đang mang tên gì - bản cũ để Postgres tự
-- đặt tên (VD staff_sessions_staff_id_fkey) nên không thể DROP CONSTRAINT theo tên cố định.
CREATE OR REPLACE FUNCTION pg_temp.drop_fk(p_table text, p_col text) RETURNS void AS $fn$
DECLARE r record;
BEGIN
  IF to_regclass(p_table) IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_attribute  a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.contype = 'f' AND con.conrelid = p_table::regclass AND a.attname = p_col
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, r.conname);
  END LOOP;
END; $fn$ LANGUAGE plpgsql;

-- Thêm một ràng buộc (CHECK / FOREIGN KEY / UNIQUE) nếu chưa tồn tại tên đó.
CREATE OR REPLACE FUNCTION pg_temp.add_con(p_table text, p_name text, p_def text) RETURNS void AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p_name AND conrelid = p_table::regclass) THEN
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', p_table, p_name, p_def);
  END IF;
END; $fn$ LANGUAGE plpgsql;

-- Đổi một cột TIMESTAMP (không múi giờ) sang TIMESTAMPTZ.
-- USING ... AT TIME ZONE 'UTC': dữ liệu cũ do máy chủ Render (chạy giờ UTC) ghi xuống nên
-- giá trị đang lưu là giờ UTC. Diễn giải đúng như vậy thì sau khi đổi kiểu, giờ hiển thị
-- theo giờ Việt Nam sẽ khớp với thực tế. Nếu database của bạn chạy ở múi giờ khác, sửa
-- 'UTC' thành múi giờ đó TRƯỚC KHI chạy.
CREATE OR REPLACE FUNCTION pg_temp.to_tstz(p_table text, p_col text) RETURNS void AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = p_table
       AND column_name = p_col AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
                   p_table, p_col, p_col);
  END IF;
END; $fn$ LANGUAGE plpgsql;


-- -------------------------------------------------------------------------------------
-- 1. Bổ sung những gì bản cũ còn thiếu (trùng với src/migrations/runMigrations.js - để
--    chạy được cả trên database chưa từng khởi động server bản mới).
-- -------------------------------------------------------------------------------------
ALTER TABLE counters       ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE staff          ADD COLUMN IF NOT EXISTS failed_login_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE staff          ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE staff          ADD COLUMN IF NOT EXISTS must_change_password SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS fill_guide JSONB;

CREATE TABLE IF NOT EXISTS staff_sessions (
  token      CHAR(64)     PRIMARY KEY,
  staff_id   CHAR(36)     NOT NULL REFERENCES staff(id),
  role       VARCHAR(20)  NOT NULL,
  full_name  VARCHAR(150) NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Vé lấy tại Kiosk không thu thập họ tên nữa.
ALTER TABLE tickets ALTER COLUMN citizen_name DROP NOT NULL;

-- Mã quầy cần 60 ký tự cho dạng lưu trữ khi xoá mềm ("QUAY-06-DEL-1735000000000").
-- Phải gỡ VIEW active_counters trước: Postgres từ chối ALTER COLUMN TYPE trên cột đang có
-- view phụ thuộc. View được tạo lại ở cuối file.
DROP VIEW IF EXISTS active_counters;

DO $$
DECLARE len int;
BEGIN
  SELECT character_maximum_length INTO len
    FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'counters' AND column_name = 'code';
  IF len IS NULL OR len < 60 THEN
    ALTER TABLE counters ALTER COLUMN code TYPE VARCHAR(60);
  END IF;
END $$;


-- -------------------------------------------------------------------------------------
-- 2. Cột mới: created_at / updated_at còn thiếu.
--    updated_at được trigger tự cập nhật (phần 6), không cần ứng dụng ghi tay.
-- -------------------------------------------------------------------------------------
ALTER TABLE counters       ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE staff          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE services       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tickets        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- required_docs có giá trị mặc định để INSERT tối giản không bị lỗi NOT NULL.
ALTER TABLE services ALTER COLUMN required_docs SET DEFAULT '[]'::jsonb;


-- -------------------------------------------------------------------------------------
-- 3. Đổi TIMESTAMP -> TIMESTAMPTZ cho toàn bộ mốc thời gian sự kiện.
--    Đây là sửa lỗi thực sự, không phải làm đẹp: máy chủ chạy giờ UTC, Trung tâm làm việc
--    giờ Việt Nam. Với TIMESTAMP, câu lệnh DATE(created_at) = CURRENT_DATE trong báo cáo và
--    giờ chạy Batch Purge cuối ngày bị lệch 7 tiếng.
-- -------------------------------------------------------------------------------------
SELECT pg_temp.to_tstz('service_fields',        'created_at');
SELECT pg_temp.to_tstz('staff',                 'created_at');
SELECT pg_temp.to_tstz('staff',                 'locked_until');
SELECT pg_temp.to_tstz('staff_sessions',        'expires_at');
SELECT pg_temp.to_tstz('staff_sessions',        'created_at');
SELECT pg_temp.to_tstz('services',              'created_at');
SELECT pg_temp.to_tstz('counters',              'updated_at');
SELECT pg_temp.to_tstz('form_templates',        'created_at');
SELECT pg_temp.to_tstz('tickets',               'created_at');
SELECT pg_temp.to_tstz('tickets',               'called_at');
SELECT pg_temp.to_tstz('tickets',               'processing_at');
SELECT pg_temp.to_tstz('tickets',               'completed_at');
SELECT pg_temp.to_tstz('tickets',               'cancelled_at');
SELECT pg_temp.to_tstz('system_configs',        'updated_at');
SELECT pg_temp.to_tstz('audit_logs',            'created_at');
SELECT pg_temp.to_tstz('ticket_status_history', 'created_at');
SELECT pg_temp.to_tstz('device_health',         'last_heartbeat_at');

-- Chuẩn hoá giá trị mặc định về now() (tương đương CURRENT_TIMESTAMP, viết thống nhất).
ALTER TABLE service_fields        ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE staff                 ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE staff_sessions        ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE services              ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE counters              ALTER COLUMN updated_at        SET DEFAULT now();
ALTER TABLE form_templates        ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE tickets               ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE system_configs        ALTER COLUMN updated_at        SET DEFAULT now();
ALTER TABLE audit_logs            ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE ticket_status_history ALTER COLUMN created_at        SET DEFAULT now();
ALTER TABLE device_health         ALTER COLUMN last_heartbeat_at SET DEFAULT now();


-- -------------------------------------------------------------------------------------
-- 4. Khoá ngoại: khai báo lại với hành vi ON DELETE rõ ràng.
--    Bản cũ để mặc định NO ACTION cho tất cả - nghĩa là xoá một tài khoản sẽ bị chặn bởi
--    chính bảng audit_logs, còn phiên đăng nhập cũ thì thành rác treo lơ lửng.
-- -------------------------------------------------------------------------------------
SELECT pg_temp.drop_fk('staff_sessions',        'staff_id');
SELECT pg_temp.drop_fk('counters',              'officer_id');
SELECT pg_temp.drop_fk('counters',              'field_id');
SELECT pg_temp.drop_fk('counters',              'active_ticket_id');
SELECT pg_temp.drop_fk('services',              'field_id');
SELECT pg_temp.drop_fk('form_templates',        'service_id');
SELECT pg_temp.drop_fk('tickets',               'service_id');
SELECT pg_temp.drop_fk('tickets',               'counter_id');
SELECT pg_temp.drop_fk('tickets',               'priority_reason_id');
SELECT pg_temp.drop_fk('ticket_status_history', 'ticket_id');
SELECT pg_temp.drop_fk('ticket_status_history', 'counter_id');
SELECT pg_temp.drop_fk('ticket_status_history', 'officer_id');
SELECT pg_temp.drop_fk('audit_logs',            'admin_id');
SELECT pg_temp.drop_fk('system_configs',        'updated_by');
SELECT pg_temp.drop_fk('device_health',         'counter_id');

-- Phiên đăng nhập gắn chặt với tài khoản -> CASCADE.
SELECT pg_temp.add_con('staff_sessions', 'fk_staff_sessions_staff',
  'FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE');
-- Xoá cán bộ chỉ làm quầy mất người phụ trách, quầy vẫn còn -> SET NULL.
SELECT pg_temp.add_con('counters', 'fk_counters_officer',
  'FOREIGN KEY (officer_id) REFERENCES staff(id) ON DELETE SET NULL');
SELECT pg_temp.add_con('counters', 'fk_counters_field',
  'FOREIGN KEY (field_id) REFERENCES service_fields(id) ON DELETE RESTRICT');
SELECT pg_temp.add_con('counters', 'fk_counters_active_ticket',
  'FOREIGN KEY (active_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL');
SELECT pg_temp.add_con('services', 'fk_services_field',
  'FOREIGN KEY (field_id) REFERENCES service_fields(id) ON DELETE RESTRICT');
SELECT pg_temp.add_con('form_templates', 'fk_form_templates_service',
  'FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE');
SELECT pg_temp.add_con('tickets', 'fk_tickets_service',
  'FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT');
SELECT pg_temp.add_con('tickets', 'fk_tickets_counter',
  'FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE RESTRICT');
SELECT pg_temp.add_con('tickets', 'fk_tickets_priority_reason',
  'FOREIGN KEY (priority_reason_id) REFERENCES priority_reasons(id) ON DELETE RESTRICT');
-- Lịch sử gắn chặt với vé -> CASCADE; nhưng giữ lại dòng lịch sử khi quầy/cán bộ bị xoá.
SELECT pg_temp.add_con('ticket_status_history', 'fk_tsh_ticket',
  'FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE');
SELECT pg_temp.add_con('ticket_status_history', 'fk_tsh_counter',
  'FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE SET NULL');
SELECT pg_temp.add_con('ticket_status_history', 'fk_tsh_officer',
  'FOREIGN KEY (officer_id) REFERENCES staff(id) ON DELETE SET NULL');
-- Điểm mấu chốt của kiểm toán: xoá tài khoản KHÔNG được làm mất dòng nhật ký.
SELECT pg_temp.add_con('audit_logs', 'fk_audit_logs_admin',
  'FOREIGN KEY (admin_id) REFERENCES staff(id) ON DELETE SET NULL');
SELECT pg_temp.add_con('system_configs', 'fk_system_configs_updated_by',
  'FOREIGN KEY (updated_by) REFERENCES staff(id) ON DELETE SET NULL');
SELECT pg_temp.add_con('device_health', 'fk_device_health_counter',
  'FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE SET NULL');


-- -------------------------------------------------------------------------------------
-- 5. Ràng buộc CHECK: chặn dữ liệu rác ngay tại tầng cơ sở dữ liệu thay vì chỉ tin ở mã
--    nguồn. Nếu câu nào báo lỗi "violates check constraint" nghĩa là dữ liệu hiện có đang
--    sai - cần dọn dữ liệu trước rồi chạy lại (cả giao dịch đã tự huỷ, không mất gì).
-- -------------------------------------------------------------------------------------
SELECT pg_temp.add_con('staff',   'chk_staff_is_active',            'CHECK (is_active IN (0,1))');
SELECT pg_temp.add_con('staff',   'chk_staff_must_change_password', 'CHECK (must_change_password IN (0,1))');
SELECT pg_temp.add_con('staff',   'chk_staff_failed_attempts',      'CHECK (failed_login_attempts >= 0)');
SELECT pg_temp.add_con('staff_sessions', 'chk_staff_sessions_role',
  $$CHECK (role IN ('SUPER_ADMIN','MANAGER','SUPERVISOR','OFFICER'))$$);
SELECT pg_temp.add_con('services', 'chk_services_is_active',   'CHECK (is_active IN (0,1))');
SELECT pg_temp.add_con('services', 'chk_services_sla',         'CHECK (sla_minutes > 0)');
SELECT pg_temp.add_con('services', 'chk_services_fee',         'CHECK (fee_amount >= 0)');
SELECT pg_temp.add_con('counters', 'chk_counters_is_deleted',  'CHECK (is_deleted IN (0,1))');
SELECT pg_temp.add_con('tickets',  'chk_tickets_is_priority',  'CHECK (is_priority IN (0,1))');
SELECT pg_temp.add_con('tickets',  'chk_tickets_retry_count',  'CHECK (retry_count >= 0)');
SELECT pg_temp.add_con('tickets',  'chk_tickets_duration',
  'CHECK (handling_duration_seconds IS NULL OR handling_duration_seconds >= 0)');
SELECT pg_temp.add_con('tickets',  'chk_tickets_sla_status',
  $$CHECK (sla_status IS NULL OR sla_status IN ('ON_TIME','LATE'))$$);
SELECT pg_temp.add_con('ticket_status_history', 'chk_tsh_to_status',
  $$CHECK (to_status IN ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD'))$$);
SELECT pg_temp.add_con('ticket_status_history', 'chk_tsh_from_status',
  $$CHECK (from_status IS NULL OR from_status IN ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD'))$$);
SELECT pg_temp.add_con('system_configs', 'chk_system_configs_value_type',
  $$CHECK (value_type IN ('NUMBER','STRING','BOOLEAN','JSON'))$$);
SELECT pg_temp.add_con('audit_logs', 'chk_audit_logs_target_type',
  $$CHECK (target_type IN ('TICKET','COUNTER','STAFF','SERVICE','FORM_TEMPLATE','CONFIG','SYSTEM'))$$);

-- Mỗi thủ tục chỉ có đúng một tờ khai mẫu (mã nguồn đã giả định như vậy).
-- Nếu dữ liệu hiện có đang vi phạm, bỏ qua và in cảnh báo thay vì làm hỏng cả migration.
DO $$
BEGIN
  IF EXISTS (SELECT service_id FROM form_templates GROUP BY service_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'Bo qua UNIQUE(form_templates.service_id): dang co thu tuc gan >1 to khai mau. Hay don du lieu roi chay lai.';
  ELSE
    PERFORM pg_temp.add_con('form_templates', 'uq_form_templates_service', 'UNIQUE (service_id)');
  END IF;
END $$;


-- -------------------------------------------------------------------------------------
-- 6. Trigger tự cập nhật updated_at
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counters_updated_at       ON counters;
DROP TRIGGER IF EXISTS trg_system_configs_updated_at ON system_configs;
DROP TRIGGER IF EXISTS trg_tickets_updated_at        ON tickets;
DROP TRIGGER IF EXISTS trg_staff_updated_at          ON staff;
DROP TRIGGER IF EXISTS trg_services_updated_at       ON services;
DROP TRIGGER IF EXISTS trg_form_templates_updated_at ON form_templates;

CREATE TRIGGER trg_counters_updated_at       BEFORE UPDATE ON counters       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_system_configs_updated_at BEFORE UPDATE ON system_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated_at        BEFORE UPDATE ON tickets        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_staff_updated_at          BEFORE UPDATE ON staff          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_services_updated_at       BEFORE UPDATE ON services       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_form_templates_updated_at BEFORE UPDATE ON form_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -------------------------------------------------------------------------------------
-- 7. Chỉ mục còn thiếu (xem chú thích chi tiết trong db/schema.sql phần 7)
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tickets_counter_queue
  ON tickets (counter_id, status, is_priority DESC, queue_position ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tickets_counter_status ON tickets (counter_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_service_status ON tickets (service_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at     ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_completed
  ON tickets (counter_id, completed_at) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_tickets_priority_reason
  ON tickets (priority_reason_id) WHERE priority_reason_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_counters_field_status ON counters (field_id, status);
CREATE INDEX IF NOT EXISTS idx_counters_is_deleted   ON counters (is_deleted);
CREATE INDEX IF NOT EXISTS idx_counters_officer
  ON counters (officer_id) WHERE officer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_counters_active_ticket
  ON counters (active_ticket_id) WHERE active_ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_status_history (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_history_officer
  ON ticket_status_history (officer_id, created_at) WHERE officer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_history_counter
  ON ticket_status_history (counter_id) WHERE counter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_role            ON staff (role);
CREATE INDEX IF NOT EXISTS idx_staff_created         ON staff (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff  ON staff_sessions (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON staff_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_services_field  ON services (field_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin   ON audit_logs (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_target  ON audit_logs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_system_configs_updated_by
  ON system_configs (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_health_counter
  ON device_health (counter_id) WHERE counter_id IS NOT NULL;


-- -------------------------------------------------------------------------------------
-- 8. Tạo lại VIEW active_counters (đã gỡ ở phần 1 để đổi kiểu cột)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW active_counters AS SELECT * FROM counters WHERE is_deleted = 0;


-- -------------------------------------------------------------------------------------
-- 9. Bổ sung tham số cấu hình mới (nếu database cũ chưa có)
-- -------------------------------------------------------------------------------------
INSERT INTO system_configs (config_key, config_value, value_type, min_bound, max_bound, description) VALUES
  ('WIFI_SSID',            'MOTCUA-FREE-WIFI', 'STRING', NULL, NULL, 'Tên mạng Wi-Fi (SSID) thực tế tại cơ sở'),
  ('WIFI_PASSWORD',        'hanhchinh2026',    'STRING', NULL, NULL, 'Mật khẩu Wi-Fi thực tế tại cơ sở'),
  ('WIFI_SECURITY',        'WPA',              'STRING', NULL, NULL, 'Kiểu bảo mật Wi-Fi để tạo mã QR: WPA, WEP hoặc nopass'),
  ('KIOSK_HOURS_ENFORCED', '1',                'NUMBER', 0, 1,      'Chặn cấp số tại Kiosk ngoài giờ làm việc'),
  ('KIOSK_OPEN_TIME',      '07:30',            'STRING', NULL, NULL, 'Giờ mở cửa (HH:MM, giờ Việt Nam). GIÁ TRỊ MẪU'),
  ('KIOSK_CLOSE_TIME',     '17:00',            'STRING', NULL, NULL, 'Giờ đóng cửa (HH:MM, giờ Việt Nam). GIÁ TRỊ MẪU'),
  ('KIOSK_WORKING_DAYS',   '1,2,3,4,5',        'STRING', NULL, NULL, 'Các ngày làm việc: 1=Thứ Hai ... 7=Chủ nhật. GIÁ TRỊ MẪU')
ON CONFLICT (config_key) DO NOTHING;

-- Tài khoản nào còn dùng đúng mật khẩu mẫu "changeme" (chuỗi băm này nằm công khai trong
-- repository) thì bị buộc đổi mật khẩu ở lần đăng nhập kế tiếp.
UPDATE staff SET must_change_password = 1
 WHERE password_hash = '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru'
   AND must_change_password = 0;

COMMIT;
