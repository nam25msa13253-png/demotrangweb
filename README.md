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
│   ├── migrations/runMigrations.js  # Migration cộng thêm, tự chạy mỗi lần khởi động (idempotent)
│   ├── services/
│   │   ├── queueEngine/         # LÕI: State Machine, Least Queue Depth, No-Show 3-Strike,
│   │   │                        #  Two-way Branching, VIP Injection, Force Re-balance...
│   │   │   ├── index.js               # Diem vao cong khai, gop lai dung 1 API nhu truoc
│   │   │   ├── ticketLifecycle.js     # Vong doi 1 ve: cap STT, goi so, No-Show, Hoan tat/Bo sung, Re-entry
│   │   │   ├── priorityAndRebalance.js # VIP Injection + Force Re-balance
│   │   │   └── adminActions.js        # Emergency Skip + Khoi phuc ve huy nham
│   │   ├── counterService.js   # Mở/Đóng/Tạm dừng quầy, đổi lĩnh vực
│   │   ├── analyticsService.js # Heatmap, Top Metrics, KPI, Peak Hour, Audit
│   │   ├── chatbotService.js   # Chatbot RAG: rule-based trước, fallback Gemini + grounding tu DB
│   │   ├── kioskFeatureGuide.js # Nội dung hướng dẫn Wi-Fi/DVC/Bổ sung hồ sơ cho chatbot
│   │   ├── purgeScheduler.js   # Max Ticket Lifetime sweep + End-of-Day Batch Purge (17:00)
│   │   └── authService.js      # Login (bcrypt) + token phiên lưu trong Postgres (staff_sessions)
│   ├── routes/                 # kioskRoutes, counterRoutes, adminRoutes, displayRoutes, authRoutes, chatbotRoutes
│   ├── websocket/wsHub.js      # Broadcast realtime cho 4 module
│   └── server.js               # Entry point (Helmet + CSP, CORS, rate-limit, routes)
├── test/                       # `npm test` (node --test) - xem muc 7
└── public/                     # Frontend tĩnh (phục vụ qua Express static)
    ├── index.html + js/index.js       # Trang chủ (tra cứu + danh mục thủ tục nổi bật)
    ├── huong-dan.html                 # Hướng dẫn sử dụng (5 bước + FAQ)
    ├── kiosk-checklist.html + js/kiosk-checklist.js  # Đối chiếu giấy tờ + Nhận STT
    │                                    (nhận ?serviceId= từ Trang chủ; tìm thủ tục đã gộp
    │                                    thẳng vào ô tìm kiếm của Trang chủ, không còn trang riêng)
    ├── counter.html + js/counter.js  # Giao diện Cán bộ Quầy (Băng chuyền)
    ├── display.html + js/display.js  # Bảng LED + Loa PA/TTS (Web Speech API)
    ├── admin.html                     # Admin Control Tower (5 tab, xem muc 4) - JS tach theo
    │                                    tab: js/admin-{monitor,dispatch,config,reports,staff}.js
    │                                    + js/admin.js (loi/dieu phoi chung, nap sau cung)
    ├── login.html + js/login.js      # Đăng nhập Cán bộ/Admin (tách biệt hoàn toàn, xem mục 3)
    ├── assets/logo.svg                # Logo hệ thống (dùng qua thẻ <img>)
    ├── js/header.js                   # Header dùng chung (logo + nav) - tự gắn vào mọi trang
    ├── js/chatbot.js                  # Widget Trợ lý AI - tự gắn vào mọi trang (xem mục 3)
    ├── js/actionDelegate.js           # Event delegation (data-action=...) thay cho onclick=...
    │                                    inline - bắt buộc phải dùng file này khi thêm nút bấm
    │                                    render động, vì Content-Security-Policy (mục 6) chặn
    │                                    tuyệt đối onclick="..." viết trực tiếp trong HTML/JS.
    ├── js/apiClient.js, toast.js, wsClient.js, confirmDialog.js, searchSuggest.js  # Tiện ích dùng chung
    └── css/common.css, css/kiosk.css # Design system dùng chung
```

Thư mục `wifi-local-service/` (ở gốc repo, tách biệt với dự án chính) là 1 dịch vụ Node độc
lập, **bắt buộc chạy trên chính máy Kiosk Windows** (không phải trên Render) để đọc Wi-Fi thật
của máy đó qua `netsh` — xem `wifi-local-service/README.md`.

---

## 2. Triển khai trên Render (Blueprint tự động)

Repo đã kèm sẵn [`render.yaml`](render.yaml) khai báo cả web service Node lẫn 1 Postgres
managed, tự wire `DATABASE_URL` giữa 2 bên — không cần tạo/điền tay bất kỳ connection string
nào.

⚠️ **`render.yaml` đang dùng `plan: free` cho cả web service lẫn Postgres** — phù hợp cho
demo/đồ án nhưng có các giới hạn cần biết trước khi trình bày như production thật: (1) web
service free tier tự "ngủ" sau ~15 phút không có traffic, lần truy cập đầu tiên sau đó mất
khoảng 30-60s để "thức dậy"; (2) Postgres free tier bị xoá tự động sau 90 ngày nếu không nâng
cấp lên plan trả phí, và giới hạn số connection đồng thời thấp hơn plan trả phí. Muốn chạy ổn
định 24/7 (không ngủ, không giới hạn thời hạn DB) thì đổi `plan: free` → `plan: starter` (hoặc
cao hơn) cho cả 2 resource trong `render.yaml` trước khi Apply Blueprint.

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
| Kiosk (công dân) | Bấm 1 thủ tục từ Trang chủ → `kiosk-checklist.html?serviceId=...` (không có trang "tìm thủ tục" riêng, đã gộp vào ô tìm kiếm của Trang chủ) |
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

⚠️ Bảng trên chỉ để tham khảo khi setup local — **không hiển thị trên bất kỳ trang công khai
nào** (đã bỏ khỏi `login.html`). Bắt buộc đổi mật khẩu thật (bcrypt hash mới, hoặc dùng tab
"Quản lý Tài khoản" trên Admin Dashboard) trước khi triển khai production — xem `db/schema.sql`.

---

## 3. Giao diện: Trang chủ tra cứu, Header/Logo dùng chung, Trợ lý AI

- **Tách biệt hoàn toàn khu vực công khai và khu vực nội bộ**: Trang chủ, Hướng dẫn, Kiosk, Bảng
  LED dùng chung 1 header công khai (logo + "Trang chủ" | "Hướng dẫn") — header này **không chứa
  bất kỳ liên kết nào** tới `/login.html` hay khu vực Quầy/Admin, để người dân tra cứu không nhìn
  thấy hoặc vô tình lạc vào luồng nội bộ. `login.html` là trang **hoàn toàn tách riêng** (không
  dùng header công khai, không được liên kết từ bất kỳ trang công khai nào, không còn hiển thị
  gợi ý tài khoản mẫu) — chỉ cán bộ biết URL trực tiếp mới truy cập.
- **Trang chủ (`index.html`)**: thiết kế theo mô hình tra cứu-trước — ô tìm kiếm thủ tục ngay ở
  hero, bên dưới là "Các thủ tục phổ biến" lấy trực tiếp từ database (không còn trang "Tìm thủ
  tục" riêng của Kiosk — đã gộp vào chính ô tìm kiếm này vì trùng lặp chức năng). Bấm vào 1 thủ
  tục sẽ mở `kiosk-checklist.html?serviceId=...` và tự động nhảy thẳng vào bước đối chiếu
  checklist giấy tờ.
- **Kiosk (`kiosk-checklist.html`)**: chỉ còn 2 bước — đối chiếu checklist giấy tờ (tick chọn) và
  nhận số thứ tự — hiển thị theo dạng stepper 3 nấc (bước 1 "Tìm thủ tục" tính từ Trang chủ).
- **Hướng dẫn (`huong-dan.html`)**: 5 bước sử dụng hệ thống + câu hỏi thường gặp.
- **Header dùng chung + logo**: `public/js/header.js` tự gắn thanh header (logo `assets/logo.svg`
  qua thẻ `<img>` + menu điều hướng) vào đầu mọi trang — chỉ cần nhúng 1 dòng
  `<script src="js/header.js"></script>`, không phải chép lại markup ở từng file. Các cờ cấu hình
  cho từng trang (VD hiện đồng hồ, tự mở chatbot) đặt qua thuộc tính `data-*` trên `<body>` (VD
  `<body data-show-header-clock="true">`) — **không** dùng `<script>` inline gán biến `window.*`
  như bản cũ, vì Content-Security-Policy (mục 6) chặn tuyệt đối script inline.
- **Trợ lý AI (chatbot hỗ trợ Kiosk)**: nút 💬 nổi ở góc phải mọi trang (`public/js/chatbot.js`),
  có sẵn các gợi ý câu hỏi (chip) hiện lại sau mỗi lượt trả lời (không mất hẳn sau câu hỏi đầu),
  và **tự mở kèm gợi ý** trên Trang chủ sau 1.2s (1 lần/phiên trình duyệt, đặt qua
  `data-chatbot-auto-open="true"` trên `<body>`) để chủ động hỗ trợ. Ngoài hỏi-đáp chung, widget
  còn xử lý trực tiếp 3 tác vụ tương tác thật (không chỉ hướng dẫn tĩnh): hiển thị mã QR Wi-Fi
  thật (đọc qua `wifi-local-service/` chạy trên máy Kiosk, xem README riêng trong thư mục đó),
  kiểm tra điều kiện nộp hồ sơ trực tuyến (DVC) qua mức định danh VNeID, và xử lý quét mã QR
  Re-entry khi công dân quay lại bổ sung hồ sơ. 2 tác vụ DVC/Re-entry cần hỏi lại 1 thông tin
  trước khi gọi API thật (`pendingAction` trong `chatbot.js`) — người dùng có thể gõ "huỷ" (hoặc
  đổi sang hỏi chủ đề khác hẳn) giữa chừng để thoát luồng đang dở, không bị "giam" trong luồng cũ
  mãi (đã từng là 1 bug: mọi tin nhắn tiếp theo bị luồng cũ nuốt hết, không có lối thoát). Widget
  gọi tới `POST /api/chatbot/ask` ở backend.
  Backend dùng **Google Gemini API**
  (`@google/genai`, model `gemini-3.6-flash` — `gemini-2.5-flash` đã bị Google ngừng hỗ trợ cho
  tài khoản mới) — API key đọc từ `GEMINI_API_KEY` trong `.env`,
  **không bao giờ lộ ra frontend**. Để tránh AI "tự bịa" thủ tục, mỗi câu hỏi được ghép kèm dữ
  liệu thật lấy trực tiếp từ database (danh mục thủ tục, checklist giấy tờ, trạng thái quầy hiện
  tại) làm căn cứ bắt buộc — đúng tinh thần RAG mô tả trong tài liệu `Chat bot.pdf` gốc.
  - Lấy API key miễn phí tại <https://aistudio.google.com/apikey> → dán vào `GEMINI_API_KEY=` trong `.env`.
  - Chưa cấu hình key thì chatbot vẫn không làm sập server — trả lời lỗi thân thiện
    "Trợ lý AI chưa được cấu hình...".
  - Có giới hạn tốc độ hỏi (tối đa 15 câu/phút/IP) vì đây là endpoint công khai, tránh bị lạm
    dụng gây tốn chi phí API.

---

## 4. Các thuật toán nghiệp vụ lõi (đã hiện thực đầy đủ trong `src/services/queueEngine/`)

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
  `23505` (unique_violation) và `23503` (foreign_key_violation) — bắt trong `adminRoutes.js` ở
  các route nhận `fieldId`/`code` từ body — khác hẳn `ER_DUP_ENTRY`/`ER_ROW_IS_REFERENCED_2` của
  MySQL.
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

## 6. Bảo mật & Ghi chú triển khai khác

- **`npm audit`**: còn 2 cảnh báo mức trung bình (`qs` array-limit bypass/DoS) do bị ghim cứng
  ngay trong chính `express@4.x` — chạy `npm audit fix` (an toàn, không breaking change) trước
  khi kiểm tra lại, nhưng phần còn lại hiện KHÔNG có bản vá tương thích Express 4.x (kể cả
  `npm audit fix --force` cũng không đổi được gì tại thời điểm viết README này) — chỉ hết hẳn khi
  nâng lên Express 5.x (breaking change, cần test kỹ trước khi làm) hoặc khi `express`/`qs` phát
  hành bản vá mới. Chạy lại `npm audit` định kỳ để biết khi nào có bản vá.
- **Content-Security-Policy**: bật qua `helmet` trong `src/server.js`, `script-src` chỉ cho phép
  `'self'` + `https://cdnjs.cloudflare.com` (CDN duy nhất đang dùng, để tải thư viện `qrcodejs`
  trong `chatbot.js`). **Không được thêm `<script>` inline hay `onclick="..."`/`onchange="..."`
  vào bất kỳ trang nào** — CSP sẽ chặn tuyệt đối (kể cả khi không báo lỗi rõ ràng, nút bấm sẽ đơn
  giản là không hoạt động). Khi cần gắn hành vi cho 1 nút render động, dùng
  `public/js/actionDelegate.js` (helper `actionAttr(tenHam, ...thamSo)` sinh thuộc tính
  `data-action`/`data-args`, xem cách dùng trong `admin.js`/`counter.js`) thay vì viết
  `onclick="..."` trực tiếp.
- **Phiên đăng nhập**: lưu trong bảng `staff_sessions` của chính Postgres (không phải Map trong
  bộ nhớ — tránh mất phiên khi Render restart/redeploy/free-tier sleep), token là chuỗi ngẫu
  nhiên 32-byte, hết hạn sau 8 giờ. Mỗi lần đăng nhập tạo 1 dòng token riêng nên **đã hỗ trợ sẵn
  thu hồi độc lập theo từng thiết bị** (đăng xuất ở máy A không ảnh hưởng phiên đang mở ở máy B).
  `verifyToken()` đối chiếu cả `staff.is_active` ngay trong câu SELECT (không chỉ tra riêng bảng
  `staff_sessions`) và `staffService.setStaffActive`/`resetStaffPassword` gọi
  `authService.revokeAllSessionsForStaff()` để xoá sạch token cũ — **khoá tài khoản hoặc đặt lại
  mật khẩu có hiệu lực ngay lập tức**, không phải chờ tới khi token tự hết hạn (đã từng là 1 lỗ
  hổng: tài khoản vừa bị khoá vẫn thao tác được tiếp tối đa 8 giờ bằng token cũ, xem
  `test/authService.test.js`). Khi lên production thật, cân nhắc thay bằng JWT ký/hết hạn chuẩn
  hoặc tích hợp SSO của cơ quan, và thêm HTTPS bắt buộc.
- **Validate input**: `src/utils/validate.js` (`requireInt`/`requireString`, không dùng thư viện
  ngoài như Joi/Zod vì phạm vi còn nhỏ) chặn sớm tham số rõ ràng sai định dạng (thiếu, không phải
  số...) ở route trước khi chạm tới DB — tránh lộ nguyên văn lỗi Postgres thô (VD "invalid input
  syntax for type integer") ra ngoài response. Áp dụng ở các route nhận id/số từ body:
  `POST /api/kiosk/tickets`, `POST /api/admin/counters`, `POST /api/admin/counters/:id/field`,
  `POST /api/admin/rebalance`, `POST /api/admin/priority-inject`.
- **is_deleted (soft-delete quầy)**: mọi truy vấn liệt kê quầy **bắt buộc** phải đọc qua VIEW
  `active_counters` (định nghĩa trong `src/migrations/runMigrations.js`, tự động lọc
  `is_deleted = 0`) thay vì tự viết `WHERE is_deleted = 0` thủ công ở từng nơi — tránh lặp lại sự
  cố quầy đã xoá vẫn rò rỉ ra Heatmap/Bảng LED do quên filter (đã từng xảy ra và được sửa ở 4 chỗ
  khác nhau). Các thao tác GHI (INSERT/UPDATE/SELECT...FOR UPDATE trong transaction nghiệp vụ)
  vẫn dùng bảng gốc `counters` như cũ trong `counterRepository.js`.
- **Gửi SMS/Zalo thật**: các điểm gọi trong `src/services/queueEngine/` đang là log console (đánh dấu
  `TODO-tich-hop`) — cắm Gateway SMS/Zalo Notification OA thật vào đúng các điểm này.
- **Web Speech API**: giọng đọc phụ thuộc trình duyệt/OS có cài voice `vi-VN` hay không. Nếu
  cần chất lượng đọc ổn định hơn, thay bằng dịch vụ TTS server-side (Google/Viettel AI...) và
  phát audio file qua Display module thay vì `speechSynthesis`.

---

## 7. Kiểm thử

```bash
npm test    # node --test, chay toan bo test/*.test.js
```

CI (`.github/workflows/ci.yml`) tự chạy `npm test` mỗi lần push/tạo Pull Request vào `main`.

| File | Bao phủ |
|---|---|
| `test/queueEngine.test.js` | 13 hàm nghiệp vụ lõi (Least Queue Depth, 3-Strike No-Show, Two-way Branching, VIP Injection, Force Re-balance, Emergency Skip, khôi phục vé...) — mock repository/configService bằng 1 "CSDL giả" trong bộ nhớ, không cần Postgres thật |
| `test/authMiddleware.test.js` | RBAC (`requirePermission`, `PERMISSION_GROUPS`) |
| `test/authService.test.js` | Xác thực token phiên, thu hồi phiên khi khoá tài khoản/đặt lại mật khẩu |
| `test/configService.test.js` | Dynamic Policy Engine, Safe Limits Validation |
| `test/ruleBasedAssistant.test.js` | Chatbot rule-based (trước khi fallback sang Gemini) |
| `test/analyticsService.test.js` | Heatmap, Top Metrics, KPI, Peak Hour |
| `test/counterService.test.js` | Mở/Đóng/Tạm dừng quầy, đổi lĩnh vực, xoá quầy (san tải vé) |
| `test/routes.test.js` | Tích hợp qua HTTP thật (`supertest`): middleware `authenticate`/`requirePermission` (401/403), `validate.js` (400), login/logout, 404 JSON |
| `test/utils.test.js` | `uuid.js`, `json.js`, `validate.js` |

`supertest` (devDependency) dựng 1 Express app ngay trong test, gắn route module thật của dự
án — khác các file test khác (chỉ gọi thẳng hàm JS của service), `routes.test.js` xác nhận
middleware/route wiring hoạt động đúng qua request/response HTTP thật.
