# Báo cáo kiểm thử & nâng cấp (20/09/2026)

## 1. Cách kiểm thử

| Lớp | Cách làm | Kết quả |
|---|---|---|
| Test đơn vị/tích hợp HTTP có sẵn | `npm test` trước khi sửa | 109/109 đạt |
| Test sau nâng cấp | `npm test` (thêm 15 test mới: lấy số không tên, theo dõi vé không lộ dữ liệu, hướng dẫn điền, ước tính thời gian chờ, giờ Việt Nam của EOD Purge, toàn vẹn nội dung hướng dẫn) | **124/124 đạt** |
| Chạy thật end-to-end | Dựng PostgreSQL 17 tạm (ngoài thư mục dự án), chạy `db/init.js`, khởi động server, gọi API + thao tác trên trình duyệt | Đạt (chi tiết mục 3) |
| Khởi động lại nhiều lần | Khởi động server 3 lần trên cùng CSDL (migration idempotent) | Không lỗi; nội dung hướng dẫn chỉ được nạp vào dòng còn trống (chưa thử thực tế việc Admin sửa rồi khởi động lại) |

Không kiểm thử được: gửi SMS/Zalo (chưa tích hợp), Trợ lý AI Gemini (cần khóa và mạng), triển khai trên Render thật, loa TTS trên Kiosk thật.

## 2. Lỗi/thiếu sót tìm thấy

| # | Mức | Vấn đề | Trạng thái |
|---|---|---|---|
| 1 | **Cao** | **EOD Purge chạy sai giờ trên Render**: dùng `new Date().getHours()` (giờ UTC của máy chủ) nên "17h" thực tế rơi vào 00:00 đêm Việt Nam, và không bao giờ chạy đúng 17:00 giờ làm việc | **Đã sửa** — tính theo `Asia/Ho_Chi_Minh` |
| 2 | **Cao** | **CORS chặn mọi thao tác ghi khi chạy ở cổng khác/qua IP mạng LAN**: danh sách cho phép chỉ có `localhost:3000` và tên miền Render; trình duyệt vẫn gửi header Origin ở POST cùng nguồn nên lấy số/đăng nhập trả lỗi 500. Chính lỗi này làm hỏng lần thử đầu của tôi khi chạy cổng 3100. Kiosk mở qua `http://192.168.x.x:3000` sẽ hỏng | **Đã sửa** — cho phép Origin cùng host, trả 403 rõ ràng cho nguồn lạ |
| 3 | Trung bình | **Có thể cấp trùng số thứ tự** khi 2 người bấm gần như cùng lúc (2 giao dịch cùng đếm ra một giá trị) | **Đã sửa** — khóa cố vấn theo lĩnh vực; kiểm tra 12 yêu cầu song song → 12 số khác nhau |
| 4 | Trung bình | Mâu thuẫn tài liệu ↔ code về họ tên; tên giả `"Khách tại Kiosk"` hiện trên màn hình cán bộ và **Bảng LED công cộng** | **Đã sửa** — xem `KIEN-NGHI-LAY-SO-KHONG-NHAP-TEN.md` |
| 5 | Trung bình | **Mẫu tờ khai có chú thích không tồn tại**: `annotated_sample_url` trỏ `/assets/samples/*.png` nhưng thư mục không có (ảnh bị ẩn âm thầm); chỉ 4/14 thủ tục có dữ liệu tờ khai; không hề có hướng dẫn điền | **Đã làm mới** — hướng dẫn điền từng ô cho cả 14 tờ khai |
| 6 | Thấp | FAQ nói vắng mặt "gọi lại đến hết giờ hành chính" và "tối đa 2 lần" — không khớp thuật toán 3-Strike thực tế | **Đã sửa** |
| 7 | Thấp | Bảng LED hiện mã trạng thái tiếng Anh (`CALLING`) cho dân | **Đã sửa** ("Đang gọi"/"Đang phục vụ") |
| 8 | Thấp | Log khởi động in URL `/kiosk.html` không tồn tại | **Đã sửa** |
| 9 | Trung bình | Kiosk vẫn cấp số **sau giờ đóng cửa** (đã qua giờ EOD) → số không bao giờ được gọi | **Đã xử lý ở đợt 2** — chặn ngoài giờ kèm công tắc bật/tắt (xem mục 6–9) |
| 10 | Trung bình | Trang lấy số là trang công khai: ai có đường dẫn cũng lấy được số từ điện thoại ở xa, không chỉ tại Kiosk | Đã thêm giới hạn tốc độ; **khuyến nghị** giới hạn IP của máy Kiosk khi triển khai thật |
| 11 | Thấp | "Hôm nay" trong CSDL (`CURRENT_DATE`) theo UTC: bộ đếm số thứ tự reset lúc 07:00 sáng giờ VN thay vì 00:00. Không sửa riêng lẻ được vì phải đổi múi giờ Node và CSDL **cùng lúc**, nếu không thời gian chờ bị lệch 7 giờ | **Chưa sửa** — cần quyết định riêng, có thể làm khi thầy yêu cầu |
| 12 | Thấp | Tên công dân ở màn hình cán bộ chèn thẳng vào HTML không escape (chỉ Admin nhập được, rủi ro thấp) | Chưa sửa |
| 13 | Thông tin | `wifi-local-service/server.js` có thay đổi chưa commit **không phải do tôi làm**; thư mục `D:\ThayChungChuyenDoiSo\Test\` là bản sao cũ, không đồng bộ với bản này | Không đụng tới |

## 3. Kết quả chạy thật (tóm tắt)

- 14/14 thủ tục có hướng dẫn điền; checklist đánh dấu đúng giấy tờ là tờ khai.
- Lấy số không tên → `201`, `citizen_name = null`, số `A-101`; thiếu giấy tờ → `REJECTED` kèm danh sách thiếu.
- 12 yêu cầu song song → 12 số duy nhất.
- Trang theo dõi: đúng số người phía trước; mã không tồn tại → `404`; Origin lạ → `403`.
- Trình duyệt: checklist có gợi ý + nút "Xem cách điền", trang hướng dẫn (tiến độ tick từng ô), phiếu STT có QR + số người chờ, trang theo dõi hoạt động.

## 4. Nâng cấp đã thực hiện

1. **Hướng dẫn điền giấy tờ** (`huong-dan-dien-mau.html`): 14 tờ khai × từng ô (nhãn, cách điền, ví dụ giả), lỗi thường gặp, bước sau khi điền, 7 quy tắc chung, gợi ý cách có từng giấy tờ đi kèm (giấy chứng sinh lấy ở đâu, hợp đồng phải công chứng…), thanh tiến độ, nút in, tự về Trang chủ khi rời máy 3 phút. Nội dung lưu ở cột `form_templates.fill_guide` nên **Admin sửa được** (`PUT /api/admin/form-templates`) mà không cần sửa code. Trợ lý AI cũng trả lời được "cách điền tờ khai".
2. **Lấy số không cần tên** + **theo dõi vé qua QR** + ước tính thời gian chờ.
3. **Sửa các lỗi** ở mục 2 (1–4, 6–8) kèm test.

## 5. Việc nên làm tiếp (theo thứ tự ưu tiên)

1. **Xem lại nội dung hướng dẫn điền cùng cán bộ Trung tâm** — tôi viết theo hiểu biết chung, chưa đối chiếu với mẫu chính thức của địa phương; vị trí kệ/khay là giá trị mẫu.
2. Đặt múi giờ cho cả Node và PostgreSQL (mục 2, #11) trước khi chạy thật.
3. Giới hạn IP máy Kiosk cho API lấy số; công tắc "ngoài giờ làm việc" (mục 2, #9–10).
4. Tích hợp SMS/Zalo rồi mới thêm ô SĐT tùy chọn.
5. Thêm ảnh tờ khai mẫu có chú thích thật (thư mục `public/assets/samples/`) nếu Trung tâm có bản scan.


---

# Đợt 2 (21/09/2026): chặn cấp số ngoài giờ, chatbot Wi-Fi, hướng dẫn nộp hồ sơ online

## 6. Kết quả kiểm thử đợt 2

- `npm test`: **155/155 đạt** (đợt 1: 124). Thêm test cho giờ mở cửa, QR Wi-Fi, tính toàn vẹn nguồn của hướng dẫn, chatbot.
- Chạy thật trên PostgreSQL 17 tạm: migration tự thêm 5 khóa cấu hình vào CSDL "cũ" (đã xóa khóa rồi khởi động lại); chặn ngoài giờ trả `CLOSED` + thông báo; tắt bằng biến môi trường `KIOSK_HOURS_ENFORCED=false` cấp số bình thường; trình duyệt: banner, màn hình đóng cửa, trang Wi-Fi, trang nộp hồ sơ, chatbot (Wi-Fi + luồng DVC) hoạt động.
- **Không kiểm thử được**: đọc Wi-Fi thật bằng `netsh` (máy thử không có bộ điều hợp Wi-Fi — dịch vụ Wireless AutoConfig không chạy; đã thử đúng đường lui sang Wi-Fi Admin cấu hình); quét mã QR bằng điện thoại thật (Android/iPhone); Trợ lý AI Gemini; chạy trên HTTPS thật của Render.

## 7. Lỗi có sẵn phát hiện thêm (đã sửa)

| # | Mức | Vấn đề | Trạng thái |
|---|---|---|---|
| 14 | **Cao** | **CSP chặn trang web gọi dịch vụ Wi-Fi `localhost:5000`** (`default-src 'self'`, thiếu `connect-src`): mã QR Wi-Fi từ máy Kiosk **chưa bao giờ hiện được** khi bật CSP. Phát hiện qua console trình duyệt | **Đã sửa** — thêm `connect-src` cho `localhost:5000`. *Chưa thử trên HTTPS thật: cần kiểm tra chỉ thị `upgrade-insecure-requests` có nâng `http://localhost:5000` lên https hay không (Chrome thường miễn cho localhost).* |
| 15 | Trung bình | Luồng DVC cũ trả về **đường dẫn tự bịa** (`dichvucong.gov.vn/deep-link/nop-ho-so`) và 4 bước không có nguồn, viết không dấu; coi "mức 2 = đủ điều kiện, mức 1 = không" mà không có căn cứ | **Đã sửa** — bỏ liên kết bịa, dùng nội dung có nguồn, nói rõ mức 1 là chưa xác thực |
| 16 | Trung bình | Mã QR Wi-Fi luôn gán cứng `T:WPA` (sai với mạng mở/WEP); mạng doanh nghiệp tạo ra mã không dùng được | **Đã sửa** — đọc kiểu bảo mật từ `netsh`; mạng doanh nghiệp/không đọc được mật khẩu → không tạo mã, chuyển sang hướng dẫn nhập tay |
| 17 | Thấp | Từ khóa "mã QR/quét mã" của luồng Re-entry cướp câu hỏi Wi-Fi ("Wi-Fi không quét được mã QR") | **Đã sửa** |
| 18 | Thông tin | API `GET /api/kiosk/wifi-qr` công khai trả mật khẩu Wi-Fi cho bất kỳ ai trên internet (README coi đây là mạng công cộng miễn phí) | Không đổi; **cân nhắc** nếu mạng Wi-Fi của Trung tâm không thật sự công cộng |

(#9 ở mục 2 — Kiosk cấp số sau giờ đóng cửa — **đã xử lý** ở đợt này với công tắc bật/tắt.)

## 8. Nội dung CHƯA xác thực (không tự suy diễn)

Chi tiết từng mục, kèm URL nguồn: `docs/HUONG-DAN-DVC-VA-WIFI-NGUON-DOI-CHIEU.md`.

**Nộp hồ sơ trực tuyến:**
- Định dạng tệp/dung lượng tối đa tải lên; ngân hàng/ví nào quét được mã thanh toán và thời hạn thanh toán; xử lý khi trả tiền rồi mà chưa báo thành công; nguyên nhân và cách xử lý lỗi đăng nhập VNeID/lỗi hệ thống; cách nhận kết quả điện tử.
- Tài khoản VNeID **mức 1** có nộp được hồ sơ hay không — các nguồn không nêu rõ (chỉ 1 nguồn, thủ tục cấp bản sao trích lục, ghi cần mức 2).
- **Hai số tổng đài khác nhau** trong hai nguồn (18001096 ở trang tra cứu của Cổng; 19001009 ở bài hướng dẫn thủ tục trích lục) — chưa biết số nào đúng; cần cán bộ gọi thử.
- Video ở nguồn bạn cung cấp (S1): chỉ đọc được phần chữ mô tả, **không xem được nội dung video**.
- Các trang được đọc qua công cụ tóm tắt, không phải bản gốc nguyên văn.

**Wi-Fi:**
- Dòng chữ chính xác điện thoại hiện khi quét QR Wi-Fi: trang Google Pixel chỉ nói mã QR "có thể kết nối Wi-Fi", trang Apple về quét QR không nhắc riêng mã Wi-Fi → các bước "chạm vào thông báo" ghi là chưa chắc chắn/chưa xác thực; định dạng QR được nguồn ZXing ghi là dùng được trên Android và **iOS 11 trở lên**.
- Tên menu tiếng Việt là bản dịch từ menu tiếng Anh trong nguồn; thực tế đổi theo hãng máy.
- Chưa thử trên điện thoại thật: mạng chỉ WPA3; máy Windows tiếng Việt (nhãn `Xác thực`).

**Giờ mở cửa:** trang chủ Trung tâm Phục vụ hành chính công Hà Nội (`ttpvhcc.hanoi.gov.vn`) **không đăng giờ làm việc**. Một kết quả tìm kiếm nêu "sáng 8:00–11:00 (Thứ Hai–Thứ Bảy), chiều 13:30–16:30 (Thứ Hai–Thứ Sáu)" nhưng không rõ áp dụng cho đơn vị nào, và hệ thống chưa hỗ trợ khung giờ sáng/chiều. Vì vậy giờ mặc định 07:30–17:00, Thứ Hai–Thứ Sáu chỉ là **giá trị mẫu** — **cần Admin nhập đúng giờ thật**.

## 9. Việc nên làm tiếp

1. Admin nhập giờ mở cửa thật (tab Cấu hình Tham số); quyết định có cần khung sáng/chiều (nghỉ trưa) hay không.
2. Cán bộ Trung tâm mở từng nguồn S1–S9 đối chiếu; gọi thử hai số tổng đài; bổ sung các mục "chưa xác thực" khi có thông tin chính thức (sửa ở `src/data/dvcGuide.js`, chạy lại `npm test`).
3. Thử quét mã QR bằng vài điện thoại thật (Android nhiều hãng, iPhone, máy cũ) và chụp ảnh màn hình thật để thay biểu tượng minh họa.
4. Chạy thử `wifi-local-service` trên máy Kiosk Windows thật (kể cả Windows tiếng Việt) và trang web trên HTTPS Render để xác nhận CSP `connect-src`.
