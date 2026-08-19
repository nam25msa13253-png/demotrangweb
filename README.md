# Hệ thống Hành chính công Một cửa Thông minh
### Smart Public Administrative Queue & Kiosk Dispatcher System

Hệ thống production-grade tiếp nhận, tiền kiểm, điều phối hàng đợi và giám sát vận
hành tại Trung tâm Hành chính công Một cửa, bám sát 100% tài liệu nghiệp vụ đã
cung cấp (Admin, Bao quát, Chat bot, Hệ thống, Người dùng, Quầy).

**Stack:** Node.js/Express + `ws` (WebSocket, cùng port với HTTP) + **PostgreSQL**
(`pg`, triển khai qua Postgres managed của Render) ở backend; HTML5/Vanilla
CSS3/JavaScript ES6+ + Web Speech API ở frontend (không dùng framework FE, không build step).

---

## 1. Cấu trúc thư mục

```
smart-queue-system/
├── db/
│   ├── schema.sql            # DDL 3NF đầy đủ cho PostgreSQL + seed data mẫu
│   └── init.js                # Script khởi tạo DB (npm run db:init)
├── src/
│   ├── config/
│   │   ├── db.js               # Pool pg + withTransaction() (SELECT...FOR UPDATE)
│   │   └── configService.js    # Dynamic Policy Engine (đọc/ghi system_configs, Safe Limits)
│   ├── middleware/
│   │   └── auth.js             # authenticate() + requirePermission() theo Ma trận RBAC
│   ├── utils/
│   │   ├── uuid.js             # Sinh UUID phía ứng dụng (crypto.randomUUID(), độc lập với DB)
│   │   └── json.js             # Parse cột JSON (pg đã tự parse JSONB, hàm này chỉ phòng hờ)
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

## 2. Triển khai trên Render (Blueprint tự động)

Repo đã kèm sẵn [`render.yaml`](render.yaml) khai báo cả web service Node lẫn 1 Postgres
managed, tự wire `DATABASE_URL` giữa 2 bên — không cần tạo/điền tay bất kỳ connection string
nào.

### Bước 1 — Tạo Blueprint

1. Đăng nhập [render.com](https://render.com) → **New +** → **Blueprint**.
2. Chọn repo GitHub của dự án. Render tự đọc `render.yaml`, hiện ra 2 resource: web service
   `smart-queue-system` + Postgres `smart-queue-db` → bấm **Apply**.

### Bước 2 — Điền biến môi trường còn thiếu

`DATABASE_URL` được tự động điền (Render tạo Postgres rồi wire connection string nội bộ vào
thẳng web service, không qua mạng public nên không cần cấu hình SSL/TCP Proxy gì thêm). Bạn chỉ
cần điền tay:

- `GEMINI_API_KEY` — lấy miễn phí tại <https://aistudio.google.com/apikey> (bỏ trống nếu chưa
  cần Trợ lý AI, vẫn deploy được — xem mục 3).

### Bước 3 — Khởi tạo schema

Sau khi service deploy xong, chạy schema 1 lần (từ máy bạn, trỏ vào Postgres của Render — lấy
`DATABASE_URL` ở tab **Environment** của service, hoặc trực tiếp ở tab **Connect** của Postgres
instance trên Render Dashboard):

```bash
DATABASE_URL="<External Database URL từ Render>" node db/init.js
```

(Dùng **External Database URL**, không phải Internal, vì bạn đang chạy lệnh này từ máy cá nhân
chứ không phải từ trong hạ tầng Render — External URL bắt buộc SSL, script đã tự bật SSL khi
phát hiện `DATABASE_URL`.)

### Chạy local (tuỳ chọn)

Cần cài PostgreSQL riêng (XAMPP chỉ có MySQL, không dùng được cho bản này):

```bash
cp .env.example .env
# Dien DB_HOST/DB_USER/DB_PASSWORD/DB_NAME theo Postgres local cua ban trong .env
npm install
npm run db:init      # chay db/schema.sql: tao bang + seed du lieu mau
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
- **Race Condition**: mọi thao tác đổi trạng thái vé/quầy đều chạy trong 1 transaction Postgres
  dùng `SELECT ... FOR UPDATE` (xem `src/config/db.js` + `src/repositories/*`).

Toàn bộ tham số nghiệp vụ (Call Timeout, Max Retry, Audio Gap, Undo Buffer, Max Ticket
Lifetime, các ngưỡng cảnh báo Heatmap...) nằm trong bảng `system_configs` và chỉnh được
trực tiếp qua tab **"Cấu hình Tham số"** của Admin Dashboard — không cần sửa code / deploy lại,
đúng tinh thần Dynamic Policy Engine, có Safe Limits Validation (biên độ cứng) chặn giá trị nguy hiểm.

---

## 5. Ghi chú kỹ thuật riêng cho PostgreSQL

Dự án khởi đầu viết cho MySQL/MariaDB (XAMPP) rồi migrate toàn bộ sang PostgreSQL để triển
khai đơn giản trên Render (Postgres managed, tự wire connection string, không cần host MySQL
ngoài + cấu hình SSL/TCP Proxy thủ công). Vài điểm đáng chú ý sau migrate:

- **Placeholder `?` được tự dịch sang `$1, $2, ...`** ngay trong `src/config/db.js`
  (`toPgPlaceholders`), nên toàn bộ câu SQL trong `src/repositories/*` giữ nguyên cú pháp `?`
  quen thuộc thay vì phải sửa lại từng chỗ.
- **UUID sinh ở tầng ứng dụng** (`src/utils/uuid.js`, dùng `crypto.randomUUID()`), không phụ
  thuộc `gen_random_uuid()` của Postgres hay extension `pgcrypto` nào.
- **`ENUM` của MySQL → `VARCHAR + CHECK constraint`** trong `db/schema.sql` (Postgres không hỗ
  trợ khai báo ENUM ngay trong định nghĩa cột như MySQL).
- **`TINYINT(1)` cờ boolean → `SMALLINT`** (không dùng kiểu `BOOLEAN` gốc của Postgres) để giữ
  nguyên các so sánh `= 1` sẵn có trong `serviceRepository.js`/`authService.js`.
- **`ON UPDATE CURRENT_TIMESTAMP` → trigger `set_updated_at()`**: Postgres không có cú pháp này
  tại chỗ khai báo cột, nên `counters.updated_at` và `system_configs.updated_at` dùng trigger
  `BEFORE UPDATE` (định nghĩa đầu `db/schema.sql`).
- **Cột JSON → `JSONB`**: khác MySQL (lưu JSON dạng `LONGTEXT`, phải tự `JSON.parse`), driver
  `pg` tự parse `JSONB` thành object/array — `src/utils/json.js` vẫn giữ lại như một lớp phòng
  hờ (không gây lỗi nếu giá trị đã là object sẵn).
- **Lỗi trùng khoá/khoá ngoại** nhận diện qua SQLSTATE của Postgres thay vì mã lỗi MySQL:
  `23505` (unique_violation, xem `adminRoutes.js`) và `23503` (foreign_key_violation, xem
  `counterService.js`) — khác hẳn `ER_DUP_ENTRY`/`ER_ROW_IS_REFERENCED_2` của MySQL.
- **`LIKE` → `ILIKE`** trong `serviceRepository.searchServices` để giữ tìm kiếm không phân biệt
  hoa/thường (MySQL mặc định không phân biệt nhờ collation `utf8mb4_unicode_ci`; Postgres `LIKE`
  thường thì có phân biệt).
- **`CURDATE()`/`HOUR()`/`TIMESTAMPDIFF()` (MySQL) → `CURRENT_DATE`/`EXTRACT(HOUR FROM ...)`/
  `EXTRACT(EPOCH FROM (b - a))`** trong `analyticsService.js` + `ticketRepository.js`. Vì
  `EXTRACT(EPOCH...)` trả `double precision`, các chỗ `ROUND(x, 1)` liên quan được ép thêm
  `::numeric` (Postgres chỉ cho `ROUND` 2 tham số trên kiểu `numeric`).
- **`RETURNING`/`SKIP LOCKED`**: Postgres hỗ trợ đầy đủ cả hai, nhưng code vẫn giữ thói quen
  SELECT lại theo `id` sau INSERT/UPDATE (trừ 1 chỗ dùng `RETURNING id` ở
  `formTemplateRepository.upsert`, thay cho `raw.insertId` kiểu mysql2 không tồn tại ở `pg`) và
  `FOR UPDATE` thường (chưa dùng `SKIP LOCKED`) để tối thiểu hoá thay đổi khi migrate.

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
