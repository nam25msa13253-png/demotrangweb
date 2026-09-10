# Dịch vụ Wi-Fi cục bộ cho Kiosk

Dịch vụ nhỏ chạy **trên chính máy tính Kiosk (Windows)**, đọc SSID + mật khẩu của mạng Wi-Fi
mà máy đang kết nối (dùng lệnh `netsh` có sẵn của Windows), rồi cung cấp API nội bộ để trang
web Kiosk (mở ngay trên trình duyệt của máy này) sinh mã QR thật cho người dân quét kết nối.

Đây **không phải** một phần của server chính trên Render — Render là máy chủ cloud, không có
quyền và không thể truy cập Wi-Fi vật lý của trụ sở. Dịch vụ này bắt buộc phải chạy trên đúng
máy Kiosk đặt tại quầy.

## Yêu cầu

- Máy Kiosk chạy Windows, đã cài [Node.js](https://nodejs.org/) (bản 18 trở lên).
- Máy đang kết nối Wi-Fi (không phải mạng dây/Ethernet).

## Cách chạy

**Khuyến nghị cho máy Kiosk thật**: bấm đúp **`install-autostart.bat`** 1 lần duy nhất — dịch
vụ sẽ tự chạy ngầm mỗi khi đăng nhập Windows, không cần bấm gì thêm về sau. Xem chi tiết ở mục
["Chạy tự động mỗi khi bật máy"](#chạy-tự-động-mỗi-khi-bật-máy--không-cần-bấm-start-wifi-servicebat-nữa-khuyến-nghị) bên dưới.

**Chạy thủ công (để test nhanh, thấy log trực tiếp)**:

1. Copy thư mục `wifi-local-service` này vào máy Kiosk (hoặc để nguyên nếu code đã có sẵn trên máy).
2. Mở Command Prompt tại thư mục này, chạy:
   ```
   npm install
   node server.js
   ```
   Hoặc đơn giản hơn: **bấm đúp vào file `start-wifi-service.bat`** — file này tự cài thư viện
   (lần đầu) và tự chạy dịch vụ, có cửa sổ hiện log để theo dõi.
3. Thấy dòng `Dang chay tai http://localhost:5000/api/current-wifi` là thành công. Để cửa sổ
   này chạy nền, không tắt đi.
4. Mở trang Kiosk trên trình duyệt của máy này như bình thường — khi hỏi trợ lý AI về Wi-Fi
   (hoặc bấm nút "Kết nối Wi-Fi"), khung chat sẽ tự lấy đúng SSID/mật khẩu của máy này và hiện
   mã QR để người dân quét.

## Chạy tự động mỗi khi bật máy — KHÔNG cần bấm `start-wifi-service.bat` nữa (khuyến nghị)

Bấm đúp **`install-autostart.bat`** — **chỉ cần làm 1 lần duy nhất**. Script sẽ:

1. Tự cài thư viện nếu chưa có.
2. Tạo 1 lối tắt trong thư mục Khởi động (Startup) của Windows, chạy dịch vụ **ẩn hoàn toàn**
   (không hiện cửa sổ đen) mỗi khi đăng nhập Windows.
3. Tự khởi động dịch vụ ngay lập tức để kiểm tra luôn, không cần đăng xuất/khởi động lại máy.

Từ lần đăng nhập Windows tiếp theo trở đi (kể cả sau khi khởi động lại máy), dịch vụ **tự chạy
ngầm**, không cần mở file `.bat` nào nữa.

- **Kiểm tra đang chạy chưa**: mở trình duyệt, vào `http://localhost:5000/health` — thấy
  `{"ok":true}` là dịch vụ đang chạy.
- **Tắt/gỡ tự động chạy**: bấm đúp `uninstall-autostart.bat`.
- **Dừng dịch vụ đang chạy ẩn** (VD để cập nhật code): mở Task Manager (Ctrl+Shift+Esc) → tìm
  tiến trình `Node.js JavaScript Runtime` → End Task. Lần đăng nhập sau nó sẽ tự chạy lại.

### Cách khác: Task Scheduler (chỉ cần nếu muốn chạy TRƯỚC KHI đăng nhập, VD máy dùng chung không tự đăng nhập)

1. Mở **Task Scheduler** → Create Task...
2. Tab **General**: đặt tên (VD "Kiosk Wifi Service"), chọn "Run whether user is logged on or not".
3. Tab **Triggers** → New... → chọn "At startup" (thay vì "At log on").
4. Tab **Actions** → New... → Program/script: `wscript.exe`; Add arguments: đường dẫn đầy đủ
   tới `run-hidden.vbs` (VD `C:\wifi-local-service\run-hidden.vbs`).
5. Lưu lại.

## Lưu ý bảo mật

- Dịch vụ chỉ lắng nghe trên `127.0.0.1` (localhost) — không mở ra mạng LAN, máy khác không
  gọi vào được.
- Chỉ cho phép trang web Kiosk chính thức (và localhost khi test) gọi vào, nhờ cấu hình CORS
  trong `server.js` (mục `ALLOWED_ORIGINS`) — đổi lại nếu tên miền trang web thay đổi.
- **Chỉ cài dịch vụ này trên đúng máy Kiosk dùng để hiển thị công khai cho người dân**, không
  cài trên máy cá nhân/máy quản trị viên, vì bất kỳ trang nào mở trên trình duyệt của máy đó
  cũng có thể đọc được mật khẩu Wi-Fi đang lưu qua dịch vụ này.
- Mật khẩu Wi-Fi trả về là mạng công cộng miễn phí dành riêng cho người dân dùng tại trụ sở,
  không phải mạng nội bộ/nhạy cảm của cơ quan.

## Xử lý sự cố

- `success: false, error: "... không có kết nối Wi-Fi nào ..."` → máy đang dùng dây mạng
  (Ethernet) hoặc chưa bật Wi-Fi.
- Khung chat không hiện mã QR, không báo lỗi gì: dịch vụ chưa chạy trên máy này — kiểm tra
  `http://localhost:5000/health`; nếu không thấy `{"ok":true}`, chạy lại `install-autostart.bat`
  (hoặc mở thủ công `start-wifi-service.bat` để xem log lỗi trực tiếp).
- Tên mạng Wi-Fi hiện sai dấu tiếng Việt: đảm bảo đang chạy đúng bản `server.js` mới nhất (đã
  xử lý `chcp 65001` để đọc đúng UTF-8).
