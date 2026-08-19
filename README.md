# Hệ thống Hành chính công Một cửa Thông minh
### Smart Public Administrative Queue & Kiosk Dispatcher System

Hệ thống production-grade tiếp nhận, tiền kiểm, điều phối hàng đợi và giám sát vận
hành tại Trung tâm Hành chính công Một cửa, bám sát 100% tài liệu nghiệp vụ đã
cung cấp (Admin, Bao quát, Chat bot, Hệ thống, Người dùng, Quầy).

**Stack:** Node.js/Express + `ws` (WebSocket, cùng port với HTTP) + **MySQL/MariaDB**
(`mysql2`, đã test thực tế trên **MariaDB 10.4.32 của XAMPP**) ở backend; HTML5/Vanilla
CSS3/JavaScript ES6+ + Web Speech API ở frontend (không dùng framework FE, không build step).

---

## 1. Cấu trúc thư mục

```
smart-queue-system/
├── db/
│   ├── schema.sql            # DDL 3NF đầy đủ cho MySQL/MariaDB + seed data mẫu
│   └── init.js                # Script khởi tạo DB (npm run db:init)
├── src/
│   ├── config/
│   │   ├── db.js               # Pool mysql2 + withTransaction() (SELECT...FOR UPDATE)
│   │   └── configService.js    # Dynamic Policy Engine (đọc/ghi system_configs, Safe Limits)
│   ├── middleware/
│   │   └── auth.js             # authenticate() + requirePermission() theo Ma trận RBAC
│   ├── utils/
│   │   ├── uuid.js             # Sinh UUID phía ứng dụng (MariaDB 10.4 không tự sinh UUID)
│   │   └── json.js             # Parse cột JSON (MariaDB trả JSON dạng chuỗi, không tự parse)
│   ├── repositories/           # Lớp truy vấn DB thuần (ticket/counter/service/audit/form)
│   ├── services/
│   │   ├── queueEngine.js      # LÕI: State Machine, Least Queue Depth, No-Show 3-Strike,
│   │   │                       #  Two-way Branching, VIP Injection, Force Re-balance...
│   │   ├── counterService.js   # Mở/Đóng/Tạm dừng quầy, đổi lĩnh vực
│   │   ├── analyticsService.js # Heatmap, Top Metrics, KPI, Peak Hour, Audit
│   │   ├── purgeScheduler.js   # Max Ticket Lifetime sweep + End-of-Day Batch Purge (17:00)
│   │   └── authService.js      # Login (bcrypt) + token phiên làm việc
│   ├── routes/                 # kioskRoutes, counterRoutes, adminRoutes, displayRoutes, authRoutes, chatbotRoutes
│   ├── websocket/wsHub.js      # Broadcast realtime cho 4 module
│   └── server.js               # Entry point
└── public/                     # Frontend tĩnh (phục vụ qua Express static)
    ├── index.html                     # Trang chủ (tra cứu + danh mục thủ tục nổi bật)
    ├── huong-dan.html                 # Hướng dẫn sử dụng (5 bước + FAQ)
    ├── kiosk.html + js/kiosk.js       # Kiosk Tiếp nhận công dân (nhận ?serviceId= từ Trang chủ)
    ├── counter.html + js/counter.js  # Giao diện Cán bộ Quầy (Băng chuyền)
    ├── display.html + js/display.js  # Bảng LED + Loa PA/TTS (Web Speech API)
    ├── admin.html + js/admin.js      # Admin Control Tower (4 phân hệ)
    ├── login.html                    # Đăng nhập Cán bộ/Admin
    ├── assets/logo.svg                # Logo hệ thống (dùng qua thẻ <img>)
    ├── js/header.js                   # Header dùng chung (logo + nav) - tự gắn vào mọi trang
    ├── js/chatbot.js                  # Widget Trợ lý AI - tự gắn vào mọi trang
    └── css/common.css                # Design system dùng chung
```

---

## 2. Cách dùng Database qua XAMPP (từng bước)

### Bước 1 — Bật MySQL trong XAMPP

Mở **XAMPP Control Panel** → bấm nút **Start** ở dòng `MySQL` (đèn chuyển xanh + hiện số port `3306`
là đã chạy). Có thể bật bằng tay qua `C:\xampp\mysql_start.bat` nếu không dùng Control Panel.

Mặc định XAMPP dùng `host=localhost`, `port=3306`, `user=root`, `password=` (rỗng) — dự án này
đã đặt sẵn các giá trị đó làm mặc định.

### Bước 2 — Tạo & xem database bằng phpMyAdmin (giao diện trực quan)

Bạn **không bắt buộc** phải thao tác tay ở đây (Bước 4 bên dưới sẽ tự tạo mọi thứ bằng lệnh
`npm run db:init`), nhưng nếu muốn xem/kiểm tra database bằng giao diện:

1. Mở trình duyệt vào `http://localhost/phpmyadmin`.
2. Sau khi chạy `npm run db:init` (Bước 4), database **`smart_queue`** sẽ xuất hiện ở cột bên trái
   — bấm vào để xem toàn bộ bảng (`tickets`, `counters`, `services`, `system_configs`,
   `audit_logs`...), xem/sửa dữ liệu trực tiếp bằng tay nếu cần.
3. Muốn làm lại từ đầu (xoá sạch dữ liệu demo): mở tab **SQL** của phpMyAdmin
   (`.../server_sql.php` hoặc menu SQL) → dán **toàn bộ nội dung file `db/schema.sql`** → bấm
   **Go**. File này tự `DROP DATABASE IF EXISTS smart_queue` trước khi tạo lại, nên dán lại bao
   nhiêu lần cũng được, không còn lỗi `#1050 - Table ... already exists` nữa.
   ⚠️ Mỗi lần chạy lại sẽ **xoá sạch** dữ liệu đang có trong `smart_queue`.

### Bước 3 — Cấu hình biến môi trường

```bash
cp .env.example .env
# Neu XAMPP MySQL cua ban co dat mat khau root, sua DB_PASSWORD trong .env
# Neu dung Tro ly AI (chatbot), dan API key vao GEMINI_API_KEY trong .env (xem muc 3)
```

### Bước 4 — Cài dependency & khởi tạo schema

```bash
npm install
npm run db:init      # chay db/schema.sql: tu CREATE DATABASE smart_queue, tao bang, seed du lieu mau
```

### Bước 5 — Chạy server

```bash
npm start             # hoặc: npm run dev (tự reload khi sửa code)
```

Server chạy tại `http://localhost:3000` (WebSocket dùng chung port qua `ws`):

| Module | URL |
|---|---|
| Trang chủ | `http://localhost:3000/` (hoặc `/index.html`) |
| Kiosk (công dân) | `http://localhost:3000/kiosk.html` |
| Cán bộ Quầy | `http://localhost:3000/login.html` → `counter.html` |
| Bảng LED / Loa PA | `http://localhost:3000/display.html` |
| Admin Control Tower | `http://localhost:3000/login.html` → `admin.html` |

### Tài khoản mẫu (mật khẩu chung: `changeme`)

| Username | Vai trò |
|---|---|
| `superadmin` | SUPER_ADMIN (toàn quyền) |
| `manager01` | MANAGER (Trưởng Trung tâm) |
| `supervisor01` | SUPERVISOR (Cán bộ Điều phối) |
| `officer01` | OFFICER (đã gán sẵn phụ trách QUAY-01, quầy này được mở sẵn) |

⚠️ Đổi mật khẩu thật (bcrypt hash mới) trước khi triển khai production — xem `db/schema.sql`.

Toàn bộ luồng đã được **kiểm thử thực tế qua API** trên chính MariaDB 10.4 của XAMPP: tạo vé,
Cổng Tiền kiểm (đủ/thiếu giấy tờ), Least Queue Depth, Gọi số → Tiếp nhận → Hoàn tất (tính đúng
AHT/SLA), VIP Injection (chen đúng vị trí kế tiếp), No-Show/3-Strike, và toàn bộ báo cáo
Heatmap/KPI/Peak Hour/Audit Log.

---

## 3. Giao diện: Trang chủ tra cứu, Header/Logo dùng chung, Trợ lý AI

- **Tách biệt hoàn toàn khu vực công khai và khu vực nội bộ**: Trang chủ, Hướng dẫn, Kiosk, Bảng
  LED dùng chung 1 header công khai (logo + "Trang chủ" | "Hướng dẫn") — header này **không chứa
  bất kỳ liên kết nào** tới `/login.html` hay khu vực Quầy/Admin, để người dân tra cứu không nhìn
  thấy hoặc vô tình lạc vào luồng nội bộ. `login.html` là trang **hoàn toàn tách riêng** (không
  dùng header công khai, không được liên kết từ bất kỳ trang công khai nào) — chỉ cán bộ biết URL
  trực tiếp mới truy cập.
- **Trang chủ (`index.html`)**: thiết kế theo mô hình tra cứu-trước — ô tìm kiếm thủ tục ngay ở
  hero, bên dưới là "Các thủ tục phổ biến" lấy trực tiếp từ database. Bấm vào 1 thủ tục sẽ mở
  `kiosk.html?serviceId=...` và tự động nhảy thẳng vào bước đối chiếu checklist giấy tờ.
- **Hướng dẫn (`huong-dan.html`)**: trang mới — 5 bước sử dụng hệ thống + câu hỏi thường gặp.
- **Header dùng chung + logo**: `public/js/header.js` tự gắn thanh header (logo `assets/logo.svg`
  qua thẻ `<img>` + menu điều hướng) vào đầu mọi trang — chỉ cần nhúng 1 dòng
  `<script src="js/header.js"></script>`, không phải chép lại markup ở từng file.
- **Trợ lý AI (chatbot hỗ trợ Kiosk)**: nút 💬 nổi ở góc phải mọi trang (`public/js/chatbot.js`),
  có sẵn các gợi ý câu hỏi (chip) ngay khi mở, và **tự mở kèm gợi ý** trên Trang chủ sau 1.2s
  (1 lần/phiên trình duyệt, đặt qua `window.CHATBOT_AUTO_OPEN = true`) để chủ động hỗ trợ.
  Widget gọi tới `POST /api/chatbot/ask` ở backend. Backend dùng **Google Gemini API**
  (`@google/genai`, model `gemini-2.5-flash`) — API key đọc từ `GEMINI_API_KEY` trong `.env`,
  **không bao giờ lộ ra frontend**. Để tránh AI "tự bịa" thủ tục, mỗi câu hỏi được ghép kèm dữ
  liệu thật lấy trực tiếp từ database (danh mục thủ tục, checklist giấy tờ, trạng thái quầy hiện
  tại) làm căn cứ bắt buộc — đúng tinh thần RAG mô tả trong tài liệu `Chat bot.pdf` gốc.
  - Lấy API key miễn phí tại <https://aistudio.google.com/apikey> → dán vào `GEMINI_API_KEY=` trong `.env`.
  - Chưa cấu hình key thì chatbot vẫn không làm sập server — trả lời lỗi thân thiện
    "Trợ lý AI chưa được cấu hình...".
  - Có giới hạn tốc độ hỏi (tối đa 15 câu/phút/IP) vì đây là endpoint công khai, tránh bị lạm
    dụng gây tốn chi phí API.

---

## 4. Các thuật toán nghiệp vụ lõi (đã hiện thực đầy đủ trong `queueEngine.js`)

- **Cấp STT theo Least Queue Depth**: tiền tố theo lĩnh vực (A/B/C-1xx), gán vào quầy `OPEN`
  cùng lĩnh vực đang có ít vé nhất.
- **Dynamic Head-to-Tail Shift & 3-Strike Drop**: hết `Call Timeout` (mặc định 45s) mà vắng mặt
  → `retry_count += 1` → nếu `< Max Retry` (mặc định 3) đẩy về cuối hàng đợi + tự động gọi số
  tiếp theo; nếu đủ 3 lần → `CANCELLED` vĩnh viễn.
- **Two-way Inspection Branching**: `PROCESSING` → `COMPLETED` (có Undo Buffer 5s) hoặc
  `PROCESSING` → `SUPP_PENDING` (cấp mã QR Re-entry, giải phóng quầy ngay lập tức).
- **Priority / VIP Queue Injection**: chèn vào vị trí kế tiếp (Active Slot + 1), **bắt buộc**
  lý do hợp lệ từ danh mục cứng + ghi Audit Log.
- **Force Re-balance / Split Queue**: trích X% đuôi hàng đợi của quầy quá tải sang quầy rảnh
  *cùng lĩnh vực* (chặn san tải khác lĩnh vực để tránh người dân di chuyển hỗn loạn).
- **Emergency Skip** & **Khôi phục vé hủy nhầm**: đều bắt buộc lý do + Audit Log.
- **End-of-Day Batch Purge**: mỗi phút kiểm tra, đúng giờ cấu hình (`EOD_PURGE_HOUR`, mặc định
  17h) sẽ chuyển toàn bộ vé còn `QUEUED`/`CALLING` sang `EXPIRED_EOD`, đóng phiên làm việc.
- **Race Condition**: mọi thao tác đổi trạng thái vé/quầy đều chạy trong 1 transaction MySQL
  (InnoDB) dùng `SELECT ... FOR UPDATE` (xem `src/config/db.js` + `src/repositories/*`).

Toàn bộ tham số nghiệp vụ (Call Timeout, Max Retry, Audio Gap, Undo Buffer, Max Ticket
Lifetime, các ngưỡng cảnh báo Heatmap...) nằm trong bảng `system_configs` và chỉnh được
trực tiếp qua tab **"Cấu hình Tham số"** của Admin Dashboard — không cần sửa code / deploy lại,
đúng tinh thần Dynamic Policy Engine, có Safe Limits Validation (biên độ cứng) chặn giá trị nguy hiểm.

---

## 5. Ghi chú kỹ thuật riêng cho MySQL/MariaDB (XAMPP)

Bản backend này **viết riêng cho MySQL/MariaDB**, không phải cổng lại một cách máy móc từ
PostgreSQL — vài điểm khác biệt quan trọng đã được xử lý:

- **Không có `RETURNING`** (MariaDB 10.4 chưa hỗ trợ, có từ 10.5): mọi INSERT/UPDATE trong
  `src/repositories/*` đều SELECT lại theo `id` ngay sau đó để lấy bản ghi đầy đủ.
- **UUID sinh ở tầng ứng dụng** (`src/utils/uuid.js`, dùng `crypto.randomUUID()`) thay vì
  `gen_random_uuid()` của Postgres — vì MariaDB 10.4 chưa có kiểu UUID gốc.
- **Không có `FILTER (WHERE ...)`**: `analyticsService.js` dùng `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`
  / `AVG(CASE WHEN ... THEN val END)` để đạt hiệu ứng tương đương.
- **Không có `SKIP LOCKED`** (MariaDB có từ 10.6, XAMPP đang là 10.4): dùng `FOR UPDATE` thường —
  vẫn đảm bảo đúng transaction/khoá dòng, chỉ khác là giao dịch đồng thời sẽ **chờ** thay vì bỏ qua.
- **Cột JSON của MariaDB thực chất là `LONGTEXT` + ràng buộc kiểm tra**, không phải kiểu JSON nhị
  phân như Postgres `JSONB` → driver `mysql2` **không tự parse**. `src/utils/json.js` xử lý việc
  này ở tầng repository (`required_docs`, `missing_doc_codes`, `payload` audit log...).

Nếu sau này nâng cấp lên MariaDB 10.6+/MySQL 8, có thể thêm `SKIP LOCKED` vào các câu
`FOR UPDATE` trong `ticketRepository.js` để tối ưu thêm dưới tải cao, nhưng không bắt buộc.

---

## 6. Ghi chú triển khai khác

- **RBAC**: xác thực bằng token phiên đơn giản trong bộ nhớ (`src/services/authService.js`) —
  đủ cho demo/tham khảo. Khi lên production, thay bằng JWT ký/hết hạn chuẩn hoặc tích hợp SSO
  của cơ quan, và thêm HTTPS bắt buộc.
- **Gửi SMS/Zalo thật**: các điểm gọi trong `queueEngine.js` đang là log console (đánh dấu
  `TODO-tich-hop`) — cắm Gateway SMS/Zalo Notification OA thật vào đúng các điểm này.
- **Web Speech API**: giọng đọc phụ thuộc trình duyệt/OS có cài voice `vi-VN` hay không. Nếu
  cần chất lượng đọc ổn định hơn, thay bằng dịch vụ TTS server-side (Google/Viettel AI...) và
  phát audio file qua Display module thay vì `speechSynthesis`.
