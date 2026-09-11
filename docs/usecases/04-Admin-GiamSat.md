# Module 04 — Giám sát Realtime (Admin Control Tower / Monitor)

Nguồn: `src/routes/adminRoutes.js` (nhóm quyền `MONITOR`), `src/services/analyticsService.js`.
Actor: Cán bộ Điều phối (Supervisor), Trưởng Trung tâm (Manager), Quản trị viên (Super Admin) —
nhóm quyền `MONITOR` cho phép cả 3 vai trò này (Officer không có quyền).

---

## UC-18 — Xem danh sách quầy & trạng thái

**Mô tả:** Hiển thị toàn bộ quầy giao dịch (kể cả quầy chưa `OPEN`) cùng trạng thái,
lĩnh vực phụ trách, cán bộ đang trực — làm dữ liệu nền cho tab "Giám sát Realtime" trên
Admin Dashboard.

**Actor:** Cán bộ Điều phối, Trưởng Trung tâm, Quản trị viên.

**Priority:** Cao (dữ liệu nền để ra quyết định điều phối).

**Trigger:** Tab "Giám sát" trên `admin.html` được mở, hoặc tự làm mới định kỳ/qua WebSocket.

**Precondition:** Đã đăng nhập (UC-01) với vai trò thuộc nhóm `MONITOR`.

**Validate on form:** Không có input; chỉ kiểm tra quyền qua `requirePermission('MONITOR')`.

**Post-condition:** Trả toàn bộ danh sách quầy (`counterRepo.listAll`, không lọc soft-delete như UC-06 vì Admin cần thấy cả quầy đã xóa để tham chiếu lịch sử nếu cần); không ghi dữ liệu.

**Basic flow:**
1. Admin/Supervisor/Manager mở tab "Giám sát" trên `admin.html`.
2. Frontend gọi `GET /api/admin/counters`.
3. `requirePermission('MONITOR')` kiểm tra vai trò hợp lệ.
4. `counterRepo.listAll()` trả toàn bộ quầy.
5. Frontend render bảng/lưới trạng thái quầy.

**Alternative flow:**
- **3a.** Vai trò không thuộc `MONITOR` (VD `OFFICER`) → HTTP 403.
- **1a.** Token hết hạn/không hợp lệ → HTTP 401 (UC-01), frontend điều hướng về `login.html`.

**Biểu đồ hoạt động:**

```mermaid
flowchart TD
    A([Bắt đầu]) --> B[Mở tab Giám sát trên admin.html]
    B --> C[GET /api/admin/counters]
    C --> D{Token hợp lệ?}
    D -- Không --> Z1[401: điều hướng login]
    D -- Có --> E{Vai trò thuộc MONITOR?}
    E -- Không --> Z2[403: không có quyền]
    E -- Có --> F[Truy vấn toàn bộ quầy]
    F --> G[Trả danh sách]
    G --> H[Render bảng trạng thái quầy]
    Z1 --> I([Kết thúc])
    Z2 --> I
    H --> I
```

**Biểu đồ tuần tự:**

```mermaid
sequenceDiagram
    actor AD as Admin/Supervisor/Manager
    participant FE as admin-monitor.js
    participant MW as authenticate + requirePermission(MONITOR)
    participant REPO as counterRepository
    participant DB as PostgreSQL

    AD->>FE: Mở tab Giám sát
    FE->>MW: GET /api/admin/counters (Bearer token)
    MW->>MW: Kiểm tra token + vai trò
    alt Không hợp lệ
        MW-->>FE: 401/403
    else Hợp lệ
        MW->>REPO: listAll(pool)
        REPO->>DB: SELECT * FROM counters
        DB-->>REPO: danh sách quầy
        REPO-->>FE: 200 [ ... ]
        FE->>AD: Hiển thị bảng trạng thái
    end
```

---

## UC-19 — Xem danh mục lĩnh vực

**Mô tả:** Liệt kê các lĩnh vực dịch vụ (`service_fields`) hiện có trong hệ thống, dùng
để hiển thị bộ lọc/gán lĩnh vực khi điều phối quầy (UC-23) hoặc thêm quầy mới (UC-24).

**Actor:** Cán bộ Điều phối, Trưởng Trung tâm, Quản trị viên.

**Priority:** Trung bình.

**Trigger:** Tab "Giám sát"/"Điều phối" cần danh sách lĩnh vực để hiển thị dropdown.

**Precondition:** Đã đăng nhập với vai trò thuộc nhóm `MONITOR`.

**Validate on form:** Không có input.

**Post-condition:** Trả danh sách `service_fields`; không ghi dữ liệu.

**Basic flow:**
1. Frontend gọi `GET /api/admin/fields`.
2. `requirePermission('MONITOR')` xác thực quyền.
3. `serviceRepo.listFields()` trả danh sách lĩnh vực.
4. Frontend render dropdown/bộ lọc theo lĩnh vực.

**Alternative flow:**
- **2a.** Không có quyền → HTTP 403.

**Biểu đồ hoạt động:**

```mermaid
flowchart TD
    A([Bắt đầu]) --> B[GET /api/admin/fields]
    B --> C{Có quyền MONITOR?}
    C -- Không --> Z[403]
    C -- Có --> D[Truy vấn service_fields]
    D --> E[Trả danh sách]
    E --> F[Render dropdown lĩnh vực]
    Z --> G([Kết thúc])
    F --> G
```

**Biểu đồ tuần tự:**

```mermaid
sequenceDiagram
    actor AD as Admin/Supervisor/Manager
    participant FE as admin.js
    participant API as GET /api/admin/fields
    participant REPO as serviceRepository
    participant DB as PostgreSQL

    AD->>FE: Mở dropdown lĩnh vực
    FE->>API: GET /api/admin/fields
    API->>REPO: listFields(pool)
    REPO->>DB: SELECT * FROM service_fields
    DB-->>REPO: danh sách
    REPO-->>FE: 200 [ ... ]
    FE->>AD: Hiển thị dropdown
```

---

## UC-20 — Xem Top Metrics

**Mô tả:** Hiển thị các chỉ số tổng quan quan trọng nhất tại thời điểm hiện tại (VD:
tổng vé đang chờ, thời gian chờ trung bình, số quầy đang mở) trên đầu Admin Dashboard.

**Actor:** Cán bộ Điều phối, Trưởng Trung tâm, Quản trị viên.

**Priority:** Trung bình.

**Trigger:** Tab "Giám sát" được mở hoặc tự làm mới định kỳ.

**Precondition:** Đã đăng nhập với vai trò thuộc nhóm `MONITOR`.

**Validate on form:** Không có input.

**Post-condition:** Trả bộ chỉ số tổng hợp thời gian thực; không ghi dữ liệu.

**Basic flow:**
1. Frontend gọi `GET /api/admin/analytics/top-metrics`.
2. `analyticsService.getTopMetrics()` tổng hợp số liệu từ `tickets`/`counters` hiện tại.
3. Trả kết quả; frontend hiển thị dạng thẻ số liệu (KPI card).

**Alternative flow:**
- **2a.** Chưa có vé/hoạt động nào trong ngày → trả số liệu 0, không lỗi.

**Biểu đồ hoạt động:**

```mermaid
flowchart TD
    A([Bắt đầu]) --> B[GET /api/admin/analytics/top-metrics]
    B --> C{Có quyền MONITOR?}
    C -- Không --> Z[403]
    C -- Có --> D[Tổng hợp số liệu hiện tại]
    D --> E[Trả JSON]
    E --> F[Hiển thị thẻ KPI]
    Z --> G([Kết thúc])
    F --> G
```

**Biểu đồ tuần tự:**

```mermaid
sequenceDiagram
    actor AD as Admin/Supervisor/Manager
    participant FE as admin-monitor.js
    participant SVC as analyticsService
    participant DB as PostgreSQL

    AD->>FE: Mở/làm mới tab Giám sát
    FE->>SVC: GET /api/admin/analytics/top-metrics
    SVC->>DB: Truy vấn tổng hợp tickets/counters
    DB-->>SVC: số liệu
    SVC-->>FE: 200 { ... }
    FE->>AD: Hiển thị thẻ KPI
```

---

## UC-21 — Xem Heatmap tải hàng đợi

**Mô tả:** Trực quan hóa mức độ tải (số vé chờ) theo quầy/lĩnh vực dưới dạng heatmap,
giúp Admin phát hiện nhanh quầy quá tải để ra quyết định Force Re-balance (UC-28).

**Actor:** Cán bộ Điều phối, Trưởng Trung tâm, Quản trị viên.

**Priority:** Cao (đầu vào trực tiếp cho quyết định điều phối).

**Trigger:** Tab "Giám sát" được mở hoặc tự làm mới định kỳ/qua WebSocket khi có thay đổi hàng đợi.

**Precondition:** Đã đăng nhập với vai trò thuộc nhóm `MONITOR`.

**Validate on form:** Không có input.

**Post-condition:** Trả dữ liệu heatmap theo quầy/lĩnh vực; không ghi dữ liệu. Các ngưỡng cảnh báo (màu vàng/đỏ) được cấu hình qua UC-32.

**Basic flow:**
1. Frontend gọi `GET /api/admin/analytics/heatmap`.
2. `analyticsService.getHeatmap()` tính số vé chờ theo từng quầy, so với ngưỡng cảnh báo trong `system_configs`.
3. Trả kết quả; frontend render heatmap (màu sắc theo mức tải).
4. Admin quan sát quầy đang "đỏ" (quá tải) để quyết định can thiệp (UC-22/UC-28).

**Alternative flow:**
- **2a.** Không quầy nào vượt ngưỡng cảnh báo → heatmap toàn "xanh", không cần can thiệp.

**Biểu đồ hoạt động:**

```mermaid
flowchart TD
    A([Bắt đầu]) --> B[GET /api/admin/analytics/heatmap]
    B --> C{Có quyền MONITOR?}
    C -- Không --> Z[403]
    C -- Có --> D[Tính số vé chờ theo quầy]
    D --> E[So với ngưỡng cảnh báo]
    E --> F[Trả dữ liệu heatmap]
    F --> G[Render màu theo mức tải]
    G --> H{Có quầy quá tải?}
    H -- Có --> I[Admin cân nhắc Rebalance/Đổi trạng thái quầy]
    H -- Không --> J[Không cần can thiệp]
    Z --> K([Kết thúc])
    I --> K
    J --> K
```

**Biểu đồ tuần tự:**

```mermaid
sequenceDiagram
    actor AD as Admin/Supervisor/Manager
    participant FE as admin-monitor.js
    participant SVC as analyticsService
    participant DB as PostgreSQL

    AD->>FE: Mở/làm mới tab Giám sát
    FE->>SVC: GET /api/admin/analytics/heatmap
    SVC->>DB: Truy vấn số vé chờ theo quầy + ngưỡng cấu hình
    DB-->>SVC: dữ liệu
    SVC-->>FE: 200 { ... }
    FE->>AD: Render heatmap
    AD->>AD: Quan sát & quyết định can thiệp (nếu cần)
```
