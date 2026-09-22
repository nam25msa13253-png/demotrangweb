# Kiến nghị: Lấy số thứ tự có cần nhập tên không?

**Kết luận: KHÔNG cần nhập tên (và không cần số điện thoại) khi lấy số tại Kiosk.**
Tôi đồng ý với đề xuất của thầy, nhưng có một điều kiện: "không nhập tên" phải đi kèm 3 biện pháp bù (mục 4). Nếu chỉ bỏ ô nhập tên mà không làm gì thêm thì phương án này sẽ tệ hơn phương án cũ ở một số tình huống.

---

## 1. Hiện trạng (kiểm tra trên code)

| Phát hiện | Vị trí |
|---|---|
| Giao diện Kiosk **đã không hỏi tên**, nhưng tự gửi tên giả `"Khách tại Kiosk"` cho mọi vé | `public/js/kiosk-checklist.js` |
| API `POST /api/kiosk/tickets` **bắt buộc** `citizenName` (`requireString`) — nên mới phải gửi tên giả | `src/routes/kioskRoutes.js` |
| Tài liệu use case ghi "công dân nhập họ tên (bắt buộc)" → **tài liệu và code mâu thuẫn nhau** | `docs/usecases/02-Kiosk-CongDan.md` |
| Tên giả này hiện ở **màn hình cán bộ quầy** (vô nghĩa, chiếm chỗ) và ở **Bảng LED công cộng** (`display.js`) | `counter.js`, `display.js`, `displayRoutes.js` |
| Loa PA **đã không đọc tên** — chỉ đọc "Mời số A-101, làm thủ tục…, đến Quầy 01" | `ticketLifecycle.js` (`buildAnnouncement`) |
| Không có chỗ nào trong hệ thống dùng tên để gọi, tra cứu hay báo cáo | toàn bộ `src/` |
| Gửi SMS/Zalo khi đến lượt mới chỉ là `TODO-tich-hop` (chưa có) → số điện thoại hiện **chưa dùng để làm gì** | `ticketLifecycle.js` |

Nói cách khác: hệ thống đã "chạy không cần tên" trên thực tế; việc còn lại là làm cho **đúng và nhất quán** (bỏ tên giả, sửa API, sửa tài liệu) và bù các chức năng mà tên/SĐT có thể đảm nhiệm.

## 2. So sánh hai phương án

| Tiêu chí | Có nhập tên | **Không nhập tên (khuyến nghị)** |
|---|---|---|
| Thời gian lấy số | Chậm hơn: gõ tiếng Việt có dấu trên màn hình cảm ứng mất 20–60 giây/người, người lớn tuổi còn lâu hơn | **Nhanh nhất**: chọn thủ tục → tích giấy tờ → nhận số |
| Xếp hàng ngay tại Kiosk | Dễ ùn ở Kiosk vì mỗi người chiếm máy lâu | Kiosk thông thoáng |
| Người lớn tuổi, người kém chữ, người không rành công nghệ | Rào cản lớn (bàn phím ảo, gõ dấu) | Không có rào cản — đúng mục tiêu "chuyển đổi số cho người dân" |
| Quyền riêng tư | Thu thập tên tại nơi công cộng; ai đứng sau có thể nhìn thấy | Không thu thập gì cả |
| Tuân thủ pháp luật về dữ liệu cá nhân | Phải có lý do chính đáng, thời hạn lưu, cơ chế xóa | Không phát sinh nghĩa vụ. Nguyên tắc "chỉ thu thập dữ liệu cần thiết cho mục đích" của Nghị định 13/2023/NĐ-CP (và Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 2026) ủng hộ phương án này *(nên đối chiếu văn bản hiện hành khi triển khai chính thức)* |
| Nhầm số / gọi nhầm người | Tên không giải quyết được (loa không đọc tên) | Giống nhau — số là định danh |
| Mất phiếu số | Có thể tra lại bằng tên (nếu hệ thống có chức năng tra cứu — hiện **không có**) | Khó tra lại → cần biện pháp bù (mục 4) |
| Lấy số ảo / phá hoại | Nhập tên "A" cũng qua, tên không ngăn được spam | Giống nhau → cần giới hạn tốc độ |
| Báo cáo/KPI | Không dùng | Không ảnh hưởng |
| Liên hệ khi vắng mặt | Tên không giúp liên hệ; **SĐT mới giúp**, nhưng chưa có SMS | Chưa mất gì vì SMS chưa tích hợp |
| Cán bộ xác minh danh tính | Tên khai ở Kiosk không có giá trị pháp lý — cán bộ vẫn phải đối chiếu **CCCD** | Giống nhau; cán bộ đối chiếu CCCD tại quầy |

**Lý do quyết định:** tên nhập ở Kiosk không tự xác thực, không được loa đọc, không được dùng để tra cứu, không có giá trị pháp lý — tức là chi phí (thời gian, rào cản, quyền riêng tư) là thật, còn lợi ích gần như bằng không.

## 3. Điểm tôi lưu ý / không hoàn toàn đồng ý

1. **"Không cần tên" ≠ "không cần gì".** Tên/SĐT, dù ít giá trị, đang vô tình đóng vai trò "cách để tìm lại vé" trong tâm lý người dùng. Bỏ đi thì phải cho họ cách khác để giữ số của mình (mục 4.1).
2. **Không nên giữ tên giả `"Khách tại Kiosk"`** như cách làm cũ: dữ liệu rác, hiện lên Bảng LED công cộng, và làm API "nói dối" về việc cần tên. Đã đổi thành `NULL` (không có).
3. **Số điện thoại (tùy chọn) sẽ có ích khi có SMS/Zalo thật** để báo "sắp đến lượt bạn". Hiện chưa có cổng SMS nên **chưa nên** đưa ô SĐT lên Kiosk (thêm thao tác mà chưa có lợi ích). API vẫn nhận `phone` tùy chọn để sau này bật lên không phải sửa backend. Nên quay lại cân nhắc khi tích hợp SMS/Zalo.
4. **Ngoại lệ hợp lý:** luồng **Chèn lượt ưu tiên** của Admin/điều phối (người cao tuổi, thương binh…) có thể ghi tên khi cán bộ trực tiếp hỏi — hệ thống vẫn cho phép nhập tùy chọn, nhưng tên đó **không còn hiển thị trên Bảng LED công cộng**.

## 4. Ba biện pháp bù (đã triển khai)

| # | Rủi ro khi bỏ tên | Biện pháp | Trạng thái |
|---|---|---|---|
| 4.1 | Người dân mất/không nhớ số | Phiếu STT hiện **mã QR** mở trang `theo-doi.html?t=<id>` trên điện thoại: số của mình, trạng thái ("ĐẾN LƯỢT BẠN!"), số người chờ phía trước, thời gian chờ ước tính. Không cần đăng nhập/tên/SĐT. Chỉ trả các trường công khai (không lộ tên/SĐT/mã Re-entry). | Đã làm + test |
| 4.2 | Rút số ảo hàng loạt (không có ai để "truy" nữa) | Giới hạn 30 lượt lấy số / 10 phút / IP. Khi triển khai thật nên chỉ cho IP của máy Kiosk gọi API này (hoặc dùng mã thiết bị Kiosk). | Đã làm giới hạn; allowlist IP là **khuyến nghị** |
| 4.3 | Mất phiếu, không còn điện thoại | Quy trình: báo nhân viên hỗ trợ; nhân viên tra theo thủ tục + giờ lấy số qua Admin (danh sách vé trong ngày đã có sẵn ở màn hình Admin). Đã ghi trong FAQ `huong-dan.html`. | Đã ghi tài liệu |

## 5. Khi nào nên đảo lại quyết định (cần thu thập SĐT/tên)

- Khi tích hợp **SMS/Zalo OA** để nhắc đến lượt → thêm ô SĐT **tùy chọn, mặc định bỏ qua**, kèm dòng cam kết chỉ dùng để nhắn số thứ tự và xóa sau ngày làm việc.
- Khi có **đặt lịch hẹn trước** → cần định danh (thường dùng SĐT hoặc VNeID).
- Khi Trung tâm có yêu cầu nghiệp vụ/quy định nội bộ bắt buộc ghi nhận người đến giao dịch ngay từ khâu lấy số.

## 6. Đã thay đổi trong hệ thống

- `POST /api/kiosk/tickets`: `citizenName`, `phone` tùy chọn (trim, cắt 150/20 ký tự, rỗng → `NULL`).
- Cột `tickets.citizen_name` cho phép `NULL`; migration tự chạy khi khởi động, dọn tên giả `"Khách tại Kiosk"` cũ.
- Kiosk không gửi tên; giao diện ghi rõ "Không cần nhập họ tên hay số điện thoại".
- Bảng LED công cộng không còn nhận/hiển thị `citizen_name`; màn hình cán bộ chỉ hiện tên nếu có.
- Thêm trang theo dõi vé + QR + giới hạn tốc độ; thêm câu hỏi thường gặp + câu trả lời cho Trợ lý AI ("có cần nhập tên không", "mất phiếu").
- Cập nhật `docs/usecases/02-Kiosk-CongDan.md` (UC-05 và UC-11 mới) và `README.md`.
