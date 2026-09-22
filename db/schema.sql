-- =====================================================================================
-- SMART PUBLIC ADMINISTRATIVE QUEUE & KIOSK DISPATCHER SYSTEM
-- Schema chuẩn hoá cho PostgreSQL 14+ (Render Postgres managed, Railway, Neon, Supabase,
-- hoặc Postgres cài tại chỗ).
--
-- NGUYÊN TẮC CỦA BẢN NÀY:
--   1. IDEMPOTENT hoàn toàn: chạy lại `npm run db:init` bao nhiêu lần cũng không lỗi,
--      không ghi đè dữ liệu đang có (CREATE ... IF NOT EXISTS + ON CONFLICT DO NOTHING).
--   2. Mọi mốc thời gian sự kiện dùng TIMESTAMPTZ (không phải TIMESTAMP): máy chủ Render
--      chạy giờ UTC còn Trung tâm làm việc theo giờ Việt Nam - dùng TIMESTAMP sẽ mất
--      thông tin múi giờ và làm sai toàn bộ báo cáo theo ngày, sai giờ Batch Purge cuối ngày.
--   3. Mọi khoá ngoại đều khai báo rõ hành vi ON DELETE (không để mặc định ngầm).
--   4. Mọi cột kiểu "trạng thái" đều có ràng buộc CHECK thay vì chuỗi tự do.
--   5. Mọi cột được JOIN / lọc WHERE / sắp xếp ORDER BY đều có chỉ mục (index).
--
-- Không có DROP/CREATE DATABASE: Postgres managed đã cấp sẵn một database riêng và tài
-- khoản ứng dụng thường không có quyền tạo/xoá database. Chạy thẳng file này vào database
-- đã được cấp là đủ.
-- =====================================================================================


-- =====================================================================================
-- 0. THIẾT LẬP CHUNG
-- =====================================================================================

-- Đặt múi giờ mặc định của database về giờ Việt Nam. Rất quan trọng: mã nguồn dùng
-- DATE(created_at) = CURRENT_DATE và EXTRACT(HOUR FROM created_at) để tính báo cáo "hôm nay"
-- và "giờ cao điểm". Nếu database vẫn để UTC thì "hôm nay" của báo cáo bị lệch 7 tiếng so
-- với ngày làm việc thực tế của Trung tâm.
-- Bọc trong khối xử lý ngoại lệ vì tài khoản ứng dụng trên một số nhà cung cấp không có
-- quyền ALTER DATABASE - khi đó bỏ qua, không làm hỏng cả script.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Ho_Chi_Minh');
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'Bo qua ALTER DATABASE SET timezone (khong du quyen) - hay dat TZ=Asia/Ho_Chi_Minh o bien moi truong.';
END $$;

-- Hàm dùng chung: tự động cập nhật cột updated_at mỗi khi UPDATE một dòng
-- (thay cho cú pháp "ON UPDATE CURRENT_TIMESTAMP" của MySQL - Postgres không có sẵn).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================================
-- 1. DANH MỤC NỀN
-- =====================================================================================

-- service_fields: lĩnh vực chuyên môn của Trung tâm (Hộ tịch, Đất đai, Đăng ký kinh doanh).
-- ticket_prefix là chữ cái đứng đầu số thứ tự của lĩnh vực đó (A-101, B-101...), phải duy nhất.
CREATE TABLE IF NOT EXISTS service_fields (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          VARCHAR(20)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  ticket_prefix CHAR(1)      NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- staff: tài khoản hệ thống (Admin + Cán bộ quầy), phân quyền theo cột role.
-- id là UUID dạng chuỗi do ứng dụng sinh (crypto.randomUUID()), không dùng kiểu UUID gốc để
-- giữ nguyên tương thích với dữ liệu và mã nguồn hiện có.
-- failed_login_attempts / locked_until: chống dò mật khẩu theo từng tài khoản.
-- must_change_password: bắt đổi mật khẩu ở lần đăng nhập kế tiếp (mật khẩu mẫu hoặc mật khẩu
-- tạm do Admin vừa cấp lại).
CREATE TABLE IF NOT EXISTS staff (
  id                    CHAR(36)     PRIMARY KEY,
  full_name             VARCHAR(150) NOT NULL,
  username              VARCHAR(60)  NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  role                  VARCHAR(20)  NOT NULL
                          CHECK (role IN ('SUPER_ADMIN','MANAGER','SUPERVISOR','OFFICER')),
  is_active             SMALLINT     NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_login_attempts SMALLINT     NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until          TIMESTAMPTZ,
  must_change_password  SMALLINT     NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- staff_sessions: phiên đăng nhập lưu trong database thay vì trong bộ nhớ tiến trình.
-- Lý do: Render (và PaaS nói chung) restart/deploy lại bất cứ lúc nào; nếu giữ phiên trong
-- bộ nhớ thì mọi người bị đăng xuất sau mỗi lần restart.
-- ON DELETE CASCADE: xoá tài khoản thì phiên đăng nhập của tài khoản đó không còn ý nghĩa.
CREATE TABLE IF NOT EXISTS staff_sessions (
  token      CHAR(64)     PRIMARY KEY,
  staff_id   CHAR(36)     NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role       VARCHAR(20)  NOT NULL
               CHECK (role IN ('SUPER_ADMIN','MANAGER','SUPERVISOR','OFFICER')),
  full_name  VARCHAR(150) NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- services: danh mục thủ tục hành chính. required_docs là danh sách giấy tờ bắt buộc dạng
-- JSON, dùng cho màn Checklist giấy tờ ở Kiosk và cho phần dữ liệu căn cứ của chatbot.
-- ON DELETE RESTRICT với lĩnh vực: không cho xoá lĩnh vực khi còn thủ tục trực thuộc.
CREATE TABLE IF NOT EXISTS services (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  field_id      INT           NOT NULL REFERENCES service_fields(id) ON DELETE RESTRICT,
  code          VARCHAR(30)   NOT NULL UNIQUE,
  name          VARCHAR(255)  NOT NULL,
  short_alias   VARCHAR(80),
  sla_minutes   INT           NOT NULL DEFAULT 25 CHECK (sla_minutes > 0),
  fee_amount    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  required_docs JSONB         NOT NULL DEFAULT '[]'::jsonb,
  is_active     SMALLINT      NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- priority_reasons: danh mục lý do ưu tiên CỨNG. Cán bộ chỉ được chọn trong danh mục này khi
-- chèn lượt ưu tiên, không được nhập lý do tự do - đây là hàng rào chống lạm quyền chèn VIP.
CREATE TABLE IF NOT EXISTS priority_reasons (
  id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code  VARCHAR(30)  NOT NULL UNIQUE,
  label VARCHAR(150) NOT NULL
);


-- =====================================================================================
-- 2. QUẦY GIAO DỊCH
-- =====================================================================================

-- counters: danh sách quầy giao dịch.
-- code dài 60 ký tự (không phải 20) vì khi "xoá" quầy (soft-delete), mã quầy gốc được đổi
-- sang dạng lưu trữ "QUAY-06-DEL-1735000000000" để giải phóng mã quầy cho lần tạo mới.
-- is_deleted: xoá mềm. Không DELETE thật vì tickets / ticket_status_history còn tham chiếu
-- tới quầy - xoá thật sẽ phá vỡ Nhật ký kiểm toán.
-- officer_id ON DELETE SET NULL: xoá cán bộ thì quầy chỉ mất người phụ trách, quầy vẫn còn.
-- Khoá ngoại active_ticket_id được thêm ở cuối file (phụ thuộc bảng tickets tạo sau).
CREATE TABLE IF NOT EXISTS counters (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             VARCHAR(60)  NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  field_id         INT          NOT NULL REFERENCES service_fields(id) ON DELETE RESTRICT,
  officer_id       CHAR(36)     REFERENCES staff(id) ON DELETE SET NULL,
  status           VARCHAR(10)  NOT NULL DEFAULT 'CLOSED'
                     CHECK (status IN ('OPEN','PAUSED','CLOSED')),
  active_ticket_id CHAR(36),
  is_deleted       SMALLINT     NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- =====================================================================================
-- 3. VÉ / HÀNG ĐỢI
-- =====================================================================================

-- tickets: trung tâm của hệ thống hàng đợi, vận hành theo máy trạng thái
-- QUEUED -> CALLING -> PROCESSING -> COMPLETED / SUPP_PENDING / CANCELLED / EXPIRED_EOD.
-- citizen_name cho phép NULL: vé lấy tại Kiosk KHÔNG thu thập họ tên, người dân được định
-- danh bằng số thứ tự để bảo vệ quyền riêng tư (loa công cộng không đọc tên).
-- counter_id ON DELETE RESTRICT: quầy dùng xoá mềm, không bao giờ xoá thật - ràng buộc này
-- là chốt chặn cuối cùng bảo vệ lịch sử vé nếu ai đó DELETE thủ công.
-- reentry_qr_token: mã QR để người dân quay lại sau khi bổ sung hồ sơ, phải là duy nhất.
CREATE TABLE IF NOT EXISTS tickets (
  id                        CHAR(36)     PRIMARY KEY,
  ticket_number             VARCHAR(20)  NOT NULL,
  service_id                INT          NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  counter_id                INT          REFERENCES counters(id) ON DELETE RESTRICT,
  citizen_name              VARCHAR(150),
  phone                     VARCHAR(20),
  status                    VARCHAR(20)  NOT NULL DEFAULT 'QUEUED'
                              CHECK (status IN ('QUEUED','CALLING','PROCESSING','SUPP_PENDING',
                                                'COMPLETED','CANCELLED','EXPIRED_EOD')),
  retry_count               INT          NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  is_priority               SMALLINT     NOT NULL DEFAULT 0 CHECK (is_priority IN (0,1)),
  priority_reason_id        INT          REFERENCES priority_reasons(id) ON DELETE RESTRICT,
  queue_position            INT,
  missing_doc_codes         JSONB,
  reentry_qr_token          VARCHAR(64)  UNIQUE,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  called_at                 TIMESTAMPTZ,
  processing_at             TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  handling_duration_seconds INT          CHECK (handling_duration_seconds IS NULL OR handling_duration_seconds >= 0),
  sla_status                VARCHAR(10)  CHECK (sla_status IS NULL OR sla_status IN ('ON_TIME','LATE')),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Khoá ngoại vòng: counters.active_ticket_id -> tickets.id. Phải thêm sau khi cả hai bảng đã
-- tồn tại. ON DELETE SET NULL để xoá một vé không làm hỏng dòng quầy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_counters_active_ticket') THEN
    ALTER TABLE counters
      ADD CONSTRAINT fk_counters_active_ticket
      FOREIGN KEY (active_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ticket_status_history: nhật ký chi tiết từng bước chuyển trạng thái của vé. Đây là nguồn
-- dữ liệu duy nhất để tính KPI cán bộ (số vé hoàn tất, thời gian xử lý trung bình, tỷ lệ đúng SLA).
-- ticket_id ON DELETE CASCADE: lịch sử gắn chặt với vé, vé mất thì lịch sử vô nghĩa.
-- officer_id / counter_id ON DELETE SET NULL: giữ lại dòng lịch sử ngay cả khi cán bộ hoặc
-- quầy bị xoá, chỉ mất phần tham chiếu.
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id   CHAR(36)    NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status VARCHAR(20) CHECK (from_status IS NULL OR from_status IN
                 ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD')),
  to_status   VARCHAR(20) NOT NULL CHECK (to_status IN
                 ('QUEUED','CALLING','PROCESSING','SUPP_PENDING','COMPLETED','CANCELLED','EXPIRED_EOD')),
  counter_id  INT         REFERENCES counters(id) ON DELETE SET NULL,
  officer_id  CHAR(36)    REFERENCES staff(id) ON DELETE SET NULL,
  event_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =====================================================================================
-- 4. TỜ KHAI MẪU, CẤU HÌNH, KIỂM TOÁN, THIẾT BỊ
-- =====================================================================================

-- form_templates: tờ khai mẫu của từng thủ tục + vị trí vật lý của phôi giấy (kệ / khay /
-- khu bàn viết) để chỉ đường cho người dân, và fill_guide là hướng dẫn điền từng mục.
-- service_id là UNIQUE: mã nguồn giả định mỗi thủ tục có đúng một tờ khai mẫu
-- (formTemplateRepository.findByServiceId chỉ lấy dòng đầu tiên) - ràng buộc này biến giả
-- định ngầm đó thành ràng buộc thật của cơ sở dữ liệu.
CREATE TABLE IF NOT EXISTS form_templates (
  id                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id           INT          NOT NULL UNIQUE REFERENCES services(id) ON DELETE CASCADE,
  form_code            VARCHAR(30)  NOT NULL UNIQUE,
  form_name            VARCHAR(255) NOT NULL,
  shelf_name           VARCHAR(60)  NOT NULL,
  tray_number          VARCHAR(20)  NOT NULL,
  desk_area            VARCHAR(60)  NOT NULL,
  annotated_sample_url VARCHAR(500),
  qr_code_url          VARCHAR(500),
  fill_guide           JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- system_configs: bộ tham số nghiệp vụ động (key - value) kèm biên độ an toàn min/max.
-- Admin sửa trực tiếp trên Dashboard, không phải sửa mã nguồn và deploy lại.
-- value_type quyết định cách ứng dụng ép kiểu giá trị khi đọc ra.
-- updated_by ON DELETE SET NULL: giữ lại tham số cấu hình khi tài khoản sửa nó bị xoá.
CREATE TABLE IF NOT EXISTS system_configs (
  config_key   VARCHAR(60)  PRIMARY KEY,
  config_value VARCHAR(255) NOT NULL,
  value_type   VARCHAR(20)  NOT NULL DEFAULT 'NUMBER'
                 CHECK (value_type IN ('NUMBER','STRING','BOOLEAN','JSON')),
  min_bound    DECIMAL(10,2),
  max_bound    DECIMAL(10,2),
  description  VARCHAR(255),
  updated_by   CHAR(36)     REFERENCES staff(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- audit_logs: Nhật ký kiểm toán, chỉ ghi thêm (append-only). Ràng buộc "không sửa / không xoá"
-- được bảo đảm ở tầng ứng dụng: auditRepository.js chỉ xuất ra hai hàm insertLog và listRecent.
-- admin_id ON DELETE SET NULL: xoá tài khoản KHÔNG được làm mất dòng nhật ký (đây là điểm mấu
-- chốt của kiểm toán - nếu dùng CASCADE thì kẻ xấu chỉ cần xoá tài khoản là xoá sạch dấu vết).
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    CHAR(36)     REFERENCES staff(id) ON DELETE SET NULL,
  action      VARCHAR(60)  NOT NULL,
  target_type VARCHAR(30)  NOT NULL
                CHECK (target_type IN ('TICKET','COUNTER','STAFF','SERVICE','FORM_TEMPLATE','CONFIG','SYSTEM')),
  target_id   VARCHAR(60),
  reason      VARCHAR(255),
  payload     JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- device_health: theo dõi tình trạng thiết bị đầu cuối (Kiosk, loa PA, bảng LED).
-- LƯU Ý: bảng này hiện CHƯA có mã nguồn nào đọc/ghi - giữ lại theo thiết kế giám sát thiết bị
-- trong tài liệu use case, sẵn sàng cho phần heartbeat sẽ bổ sung sau.
CREATE TABLE IF NOT EXISTS device_health (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_type       VARCHAR(20) NOT NULL CHECK (device_type IN ('KIOSK','PA_SPEAKER','LED_BOARD')),
  device_code       VARCHAR(60) NOT NULL,
  counter_id        INT         REFERENCES counters(id) ON DELETE SET NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'ONLINE'
                      CHECK (status IN ('ONLINE','OFFLINE','DEGRADED')),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_device UNIQUE (device_type, device_code)
);


-- =====================================================================================
-- 5. VIEW: active_counters
-- Dùng cho MỌI truy vấn CHỈ ĐỌC (báo cáo / hiển thị) cần liệt kê quầy. Gom điều kiện
-- is_deleted = 0 về một chỗ duy nhất thay vì lặp lại WHERE c.is_deleted = 0 ở từng câu lệnh
-- (đã từng quên bộ lọc này ở 4 nơi khiến quầy đã xoá vẫn hiện ra). Các thao tác GHI
-- (INSERT/UPDATE/SELECT ... FOR UPDATE trong giao dịch nghiệp vụ) vẫn dùng bảng gốc counters.
-- =====================================================================================
CREATE OR REPLACE VIEW active_counters AS SELECT * FROM counters WHERE is_deleted = 0;


-- =====================================================================================
-- 6. TRIGGER cập nhật updated_at
-- Postgres không có IF NOT EXISTS cho CREATE TRIGGER nên dùng DROP ... IF EXISTS trước.
-- =====================================================================================
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


-- =====================================================================================
-- 7. CHỈ MỤC (INDEX)
-- Nguyên tắc: mọi khoá ngoại đều có chỉ mục, mọi cột dùng trong WHERE / ORDER BY của truy vấn
-- thực tế trong mã nguồn đều có chỉ mục. Tên truy vấn tương ứng ghi trong chú thích.
-- =====================================================================================

-- --- tickets: nhóm truy vấn nóng nhất của hệ thống ---
-- findNextQueuedForCounter / listQueueForCounter / listTailQueued: lọc theo quầy + trạng thái
-- rồi sắp xếp theo is_priority DESC, queue_position, created_at. Chỉ mục ghép này phục vụ
-- cả phần lọc lẫn phần sắp xếp nên không phải sort lại trong bộ nhớ.
CREATE INDEX IF NOT EXISTS idx_tickets_counter_queue
  ON tickets (counter_id, status, is_priority DESC, queue_position ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tickets_counter_status ON tickets (counter_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_service_status ON tickets (service_id, status);
-- listActionableForAdmin, getPeakHourAnalysis, getTopMetrics: lọc/nhóm theo ngày tạo vé.
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);
-- getTrackingInfo: thời gian xử lý trung bình trong ngày của một quầy (chỉ vé đã hoàn tất).
CREATE INDEX IF NOT EXISTS idx_tickets_completed
  ON tickets (counter_id, completed_at) WHERE status = 'COMPLETED';
-- Khoá ngoại priority_reason_id (chỉ một phần nhỏ vé là vé ưu tiên nên dùng chỉ mục một phần).
CREATE INDEX IF NOT EXISTS idx_tickets_priority_reason
  ON tickets (priority_reason_id) WHERE priority_reason_id IS NOT NULL;

-- --- counters ---
CREATE INDEX IF NOT EXISTS idx_counters_field_status ON counters (field_id, status);
CREATE INDEX IF NOT EXISTS idx_counters_is_deleted   ON counters (is_deleted);
-- staffRepository.listAll: LEFT JOIN counters c ON c.officer_id = s.id
-- counterRepository.clearOfficerFromOtherCounters: UPDATE ... WHERE officer_id = ?
CREATE INDEX IF NOT EXISTS idx_counters_officer
  ON counters (officer_id) WHERE officer_id IS NOT NULL;
-- displayRoutes /counters và counterRepository.listAll: LEFT JOIN tickets t ON t.id = c.active_ticket_id
CREATE INDEX IF NOT EXISTS idx_counters_active_ticket
  ON counters (active_ticket_id) WHERE active_ticket_id IS NOT NULL;

-- --- ticket_status_history ---
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_status_history (ticket_id, created_at);
-- getOfficerKpi (JOIN h.officer_id = s.id) và getOfficerTodayStats (WHERE h.officer_id = ?).
CREATE INDEX IF NOT EXISTS idx_ticket_history_officer
  ON ticket_status_history (officer_id, created_at) WHERE officer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_history_counter
  ON ticket_status_history (counter_id) WHERE counter_id IS NOT NULL;

-- --- staff & phiên đăng nhập ---
-- listByRole (WHERE role = ?) và getOfficerKpi (WHERE s.role = 'OFFICER').
CREATE INDEX IF NOT EXISTS idx_staff_role    ON staff (role);
CREATE INDEX IF NOT EXISTS idx_staff_created ON staff (created_at DESC);
-- authService.revokeAllSessionsForStaff: DELETE ... WHERE staff_id = ?
CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff   ON staff_sessions (staff_id);
-- Dọn phiên hết hạn định kỳ: DELETE ... WHERE expires_at < now()
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON staff_sessions (expires_at);

-- --- danh mục thủ tục ---
-- Mọi truy vấn thủ tục đều JOIN service_fields qua field_id và lọc is_active = 1.
CREATE INDEX IF NOT EXISTS idx_services_field  ON services (field_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active);

-- --- kiểm toán ---
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
-- listRecent: LEFT JOIN staff s ON s.id = al.admin_id
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin  ON audit_logs (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_type, target_id);

-- --- còn lại (khoá ngoại) ---
CREATE INDEX IF NOT EXISTS idx_system_configs_updated_by
  ON system_configs (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_health_counter
  ON device_health (counter_id) WHERE counter_id IS NOT NULL;


-- =====================================================================================
-- 8. DỮ LIỆU DANH MỤC & DỮ LIỆU MẪU
-- Tất cả đều dùng ON CONFLICT DO NOTHING: chạy lại script không nhân bản dữ liệu và không
-- ghi đè những gì quản trị viên đã chỉnh sửa.
-- =====================================================================================

-- Lý do ưu tiên (danh mục cứng)
INSERT INTO priority_reasons (code, label) VALUES
  ('ELDERLY_80', 'Người già trên 80 tuổi'),
  ('VETERAN',    'Thương binh / Người có công'),
  ('PREGNANT',   'Phụ nữ mang thai'),
  ('EMERGENCY',  'Trường hợp khẩn cấp')
ON CONFLICT (code) DO NOTHING;

-- Tham số nghiệp vụ động
INSERT INTO system_configs (config_key, config_value, value_type, min_bound, max_bound, description) VALUES
  ('CALL_TIMEOUT_SECONDS',        '45',                 'NUMBER', 30,  120, 'Thời gian đếm ngược chờ công dân có mặt sau khi gọi số'),
  ('MAX_RETRY_COUNT',             '3',                  'NUMBER', 1,   5,   'Số lần nhắc vắng tối đa trước khi 3-Strike Drop'),
  ('MAX_TICKET_LIFETIME_MINUTES', '120',                'NUMBER', 30,  480, 'Thời gian sống tối đa của vé vắng mặt trước khi EXPIRED'),
  ('UNDO_BUFFER_SECONDS',         '5',                  'NUMBER', 0,   10,  'Thời gian đệm cho phép hoàn tác nút Hoàn tất'),
  ('AUDIO_GAP_SECONDS',           '1.5',                'NUMBER', 0.5, 3,   'Khoảng lặng giữa 2 bản tin loa TTS'),
  ('QUEUE_LENGTH_ALERT',          '8',                  'NUMBER', 1,   50,  'Ngưỡng cảnh báo độ dài hàng đợi (Heatmap Đỏ)'),
  ('AHT_ALERT_MINUTES',           '25',                 'NUMBER', 1,   120, 'Ngưỡng cảnh báo thời gian xử lý'),
  ('AWT_ALERT_MINUTES',           '35',                 'NUMBER', 1,   120, 'Ngưỡng cảnh báo thời gian chờ đợi (Heatmap Đỏ)'),
  ('QUEUE_HEATMAP_YELLOW_MIN',    '4',                  'NUMBER', 1,   50,  'Ngưỡng dưới mức Vàng'),
  ('EOD_PURGE_HOUR',              '17',                 'NUMBER', 0,   23,  'Giờ kích hoạt Batch Purge cuối ngày (giờ Việt Nam)'),
  ('TTS_VOICE',                   'vi-VN-Standard-A',   'STRING', NULL, NULL, 'Giọng đọc TTS mặc định (Nữ MB)'),
  ('TTS_SPEED',                   '1.0',                'NUMBER', 0.5, 2.0, 'Tốc độ đọc loa'),
  ('TTS_VOLUME',                  '85',                 'NUMBER', 0,   100, 'Âm lượng mặc định (%)'),
  ('WIFI_SSID',                   'MOTCUA-FREE-WIFI',   'STRING', NULL, NULL, 'Tên mạng Wi-Fi (SSID) thực tế tại cơ sở - sửa theo đúng mạng thật, hiện trên màn hình Kiosk'),
  ('WIFI_PASSWORD',               'hanhchinh2026',      'STRING', NULL, NULL, 'Mật khẩu Wi-Fi thực tế tại cơ sở - sửa theo đúng mật khẩu thật, hiện trên màn hình Kiosk'),
  ('WIFI_SECURITY',               'WPA',                'STRING', NULL, NULL, 'Kiểu bảo mật Wi-Fi để tạo mã QR: WPA (WPA/WPA2/WPA3 cá nhân), WEP hoặc nopass (mạng mở)'),
  ('KIOSK_HOURS_ENFORCED',        '1',                  'NUMBER', 0,   1,   'Chặn cấp số tại Kiosk ngoài giờ làm việc: 1 = chặn, 0 = không chặn'),
  ('KIOSK_OPEN_TIME',             '07:30',              'STRING', NULL, NULL, 'Giờ mở cửa (HH:MM, giờ Việt Nam). GIÁ TRỊ MẪU - hãy sửa cho đúng'),
  ('KIOSK_CLOSE_TIME',            '17:00',              'STRING', NULL, NULL, 'Giờ đóng cửa (HH:MM, giờ Việt Nam). GIÁ TRỊ MẪU - hãy sửa cho đúng'),
  ('KIOSK_WORKING_DAYS',          '1,2,3,4,5',          'STRING', NULL, NULL, 'Các ngày làm việc: 1=Thứ Hai ... 7=Chủ nhật, cách nhau bằng dấu phẩy. GIÁ TRỊ MẪU')
ON CONFLICT (config_key) DO NOTHING;

-- Lĩnh vực chuyên môn
INSERT INTO service_fields (code, name, ticket_prefix) VALUES
  ('HOTICH',    'Hộ tịch - Tư pháp',      'A'),
  ('DATDAI',    'Đất đai - Tài nguyên',   'B'),
  ('KINHDOANH', 'Đăng ký Kinh doanh',     'C')
ON CONFLICT (code) DO NOTHING;

-- Danh mục thủ tục hành chính. Dùng (SELECT id FROM service_fields WHERE code = ...) thay vì
-- số 1/2/3 cứng: khi chạy lại trên database đã có dữ liệu, id tự tăng không chắc còn là 1/2/3.
INSERT INTO services (field_id, code, name, short_alias, sla_minutes, fee_amount, required_docs) VALUES
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'KHAISINH',     'Đăng ký khai sinh',                                  'khai sinh',                        15, 0,      '[{"code":"CMND","name":"CCCD/CMND bản chính","mandatory":true},{"code":"GCN_SINH","name":"Giấy chứng sinh","mandatory":true},{"code":"TOKHAI_KS","name":"Tờ khai đăng ký khai sinh","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'KETHON',       'Đăng ký kết hôn',                                    'đăng ký kết hôn',                  20, 0,      '[{"code":"CCCD","name":"CCCD hai bên","mandatory":true},{"code":"XNTTHN","name":"Giấy xác nhận tình trạng hôn nhân","mandatory":true},{"code":"TOKHAI_KH","name":"Tờ khai đăng ký kết hôn","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'KHAITU',       'Đăng ký khai tử',                                    'khai tử',                          15, 0,      '[{"code":"CCCD","name":"CCCD người khai","mandatory":true},{"code":"GIAYBAOTU","name":"Giấy báo tử","mandatory":true},{"code":"TOKHAI_KT","name":"Tờ khai đăng ký khai tử","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'XNTTHN',       'Xác nhận tình trạng hôn nhân',                       'xác nhận độc thân',                15, 0,      '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TOKHAI_XNHN","name":"Tờ khai xác nhận tình trạng hôn nhân","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'CAICHINH_HT',  'Cải chính hộ tịch',                                  'cải chính hộ tịch',                25, 0,      '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GIAYTOCHUNGMINH","name":"Giấy tờ chứng minh nội dung cải chính","mandatory":true},{"code":"TOKHAI_CC","name":"Tờ khai cải chính hộ tịch","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='HOTICH'),    'TRICHLUC_HT',  'Trích lục hộ tịch',                                  'trích lục hộ tịch',                15, 8000,   '[{"code":"CCCD","name":"CCCD/CMND bản chính người yêu cầu","mandatory":true},{"code":"TOKHAI_TLHT","name":"Tờ khai yêu cầu cấp bản sao trích lục hộ tịch","mandatory":true},{"code":"THONGTIN_SUKIEN","name":"Thông tin sự kiện hộ tịch đã đăng ký (số, quyển, ngày đăng ký nếu có)","mandatory":false}]'),
  ((SELECT id FROM service_fields WHERE code='DATDAI'),    'SANGTEN',      'Sang tên Giấy chứng nhận Quyền sử dụng đất',         'sang tên sổ đỏ',                   30, 500000, '[{"code":"CCCD","name":"CCCD hai bên","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"HDCN","name":"Hợp đồng chuyển nhượng công chứng","mandatory":true},{"code":"TOKHAI_ST","name":"Tờ khai sang tên","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='DATDAI'),    'CAPMOI_GCN',   'Cấp mới Giấy chứng nhận Quyền sử dụng đất',          'cấp mới sổ đỏ',                    30, 500000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"NGUONGOCDAT","name":"Giấy tờ nguồn gốc đất","mandatory":true},{"code":"TOKHAI_DKDD","name":"Tờ khai đăng ký đất đai","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='DATDAI'),    'TACHTHUA',     'Tách thửa đất',                                      'tách thửa',                        30, 300000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"SODOTACHTHUA","name":"Sơ đồ tách thửa","mandatory":true},{"code":"TOKHAI_TT","name":"Tờ khai tách thửa","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='DATDAI'),    'CHUYENMDSDD',  'Chuyển mục đích sử dụng đất',                        'chuyển mục đích sử dụng đất',      30, 500000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNQSDD","name":"Giấy chứng nhận QSDD bản chính","mandatory":true},{"code":"TOKHAI_CMD","name":"Tờ khai chuyển mục đích sử dụng đất","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='KINHDOANH'), 'DKKD_HKD',     'Đăng ký Hộ kinh doanh',                              'đăng ký hộ kinh doanh',            20, 100000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TOKHAI_HKD","name":"Tờ khai đăng ký hộ kinh doanh","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='KINHDOANH'), 'THAYDOI_DKKD', 'Thay đổi nội dung Đăng ký Kinh doanh',               'thay đổi đăng ký kinh doanh',      20, 100000, '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNDKKD_CU","name":"Giấy chứng nhận ĐKKD cũ","mandatory":true},{"code":"TOKHAI_TDDKKD","name":"Tờ khai thay đổi nội dung ĐKKD","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='KINHDOANH'), 'TAMNGUNG_KD',  'Tạm ngừng kinh doanh',                               'tạm ngừng kinh doanh',             15, 0,      '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"TBTAMNGUNG","name":"Thông báo tạm ngừng kinh doanh","mandatory":true}]'),
  ((SELECT id FROM service_fields WHERE code='KINHDOANH'), 'GIAITHE_HKD',  'Giải thể Hộ kinh doanh',                             'giải thể hộ kinh doanh',           20, 0,      '[{"code":"CCCD","name":"CCCD bản chính","mandatory":true},{"code":"GCNDKKD","name":"Giấy chứng nhận ĐKKD bản chính","mandatory":true},{"code":"TOKHAI_GT","name":"Tờ khai giải thể hộ kinh doanh","mandatory":true}]')
ON CONFLICT (code) DO NOTHING;

-- Quầy giao dịch mẫu
INSERT INTO counters (code, name, field_id, status) VALUES
  ('QUAY-01', 'Quầy 01', (SELECT id FROM service_fields WHERE code='HOTICH'),    'CLOSED'),
  ('QUAY-02', 'Quầy 02', (SELECT id FROM service_fields WHERE code='HOTICH'),    'CLOSED'),
  ('QUAY-03', 'Quầy 03', (SELECT id FROM service_fields WHERE code='DATDAI'),    'CLOSED'),
  ('QUAY-04', 'Quầy 04', (SELECT id FROM service_fields WHERE code='DATDAI'),    'CLOSED'),
  ('QUAY-05', 'Quầy 05', (SELECT id FROM service_fields WHERE code='KINHDOANH'), 'CLOSED')
ON CONFLICT (code) DO NOTHING;

-- Tờ khai mẫu + vị trí phôi giấy. Nội dung hướng dẫn điền chi tiết (fill_guide) do
-- src/migrations/runMigrations.js nạp từ src/data/formGuides.js khi server khởi động.
INSERT INTO form_templates (service_id, form_code, form_name, shelf_name, tray_number, desk_area, annotated_sample_url) VALUES
  ((SELECT id FROM services WHERE code='KHAISINH'),    'TK-KS-01',   'Tờ khai đăng ký khai sinh',                          'Kệ A', 'Khay 1', 'Khu Bàn viết A', '/assets/samples/tk-ks-01.png'),
  ((SELECT id FROM services WHERE code='SANGTEN'),     'TK-ST-01',   'Tờ khai sang tên QSDD',                              'Kệ B', 'Khay 2', 'Khu Bàn viết B', '/assets/samples/tk-st-01.png'),
  ((SELECT id FROM services WHERE code='DKKD_HKD'),    'TK-HKD-01',  'Tờ khai đăng ký hộ kinh doanh',                      'Kệ C', 'Khay 1', 'Khu Bàn viết C', '/assets/samples/tk-hkd-01.png'),
  ((SELECT id FROM services WHERE code='TRICHLUC_HT'), 'TK-TLHT-01', 'Tờ khai yêu cầu cấp bản sao trích lục hộ tịch',      'Kệ A', 'Khay 2', 'Khu Bàn viết A', '/assets/samples/tk-tlht-01.png')
ON CONFLICT (form_code) DO NOTHING;

-- Tài khoản mẫu. Mật khẩu của cả 4 tài khoản là "changeme".
-- must_change_password = 1: chuỗi băm của "changeme" nằm công khai ngay trong file này, nên cả
-- 4 tài khoản bị buộc đổi mật khẩu riêng ở lần đăng nhập đầu tiên (màn đăng nhập tự hiện form
-- đổi mật khẩu - xem public/js/login.js), không thể tiếp tục dùng "changeme".
-- Dùng UUID cố định thay vì gọi hàm sinh UUID để không phụ thuộc extension pgcrypto/uuid-ossp
-- (nhiều database managed không bật sẵn).
INSERT INTO staff (id, full_name, username, password_hash, role, must_change_password) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Super Admin',        'superadmin',   '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPER_ADMIN', 1),
  ('22222222-2222-4222-8222-222222222222', 'Trưởng Trung tâm',   'manager01',    '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'MANAGER',     1),
  ('33333333-3333-4333-8333-333333333333', 'Cán bộ Điều phối',   'supervisor01', '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'SUPERVISOR',  1),
  ('44444444-4444-4444-8444-444444444444', 'Cán bộ Quầy 01',     'officer01',    '$2a$10$0vx4PhQh65zFRiLNrFPC7eV9UuJi4EfrKzrW.PbhFBXPGQ4frwUru', 'OFFICER',     1)
ON CONFLICT (id) DO NOTHING;

-- Gán Cán bộ Quầy 01 phụ trách QUAY-01 và mở quầy sẵn cho demo.
-- Chỉ chạy khi quầy chưa có ai phụ trách, để lần chạy lại không ghi đè phân công thực tế.
UPDATE counters
   SET officer_id = (SELECT id FROM staff WHERE username = 'officer01'),
       status     = 'OPEN'
 WHERE code = 'QUAY-01' AND officer_id IS NULL;
