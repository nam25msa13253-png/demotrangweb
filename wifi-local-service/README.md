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

1. Copy thư mục `wifi-local-service` này vào máy Kiosk (hoặc để nguyên nếu code đã có sẵn trên máy).
2. Mở Command Prompt tại thư mục này, chạy:
   ```
   npm install
   node server.js
   ```
   Hoặc đơn giản hơn: **bấm đúp vào file `start-wifi-service.bat`** — file này tự cài thư viện
   (lần đầu) và tự chạy dịch vụ.
3. Thấy dòng `Dang chay tai http://localhost:5000/api/current-wifi` là thành công. Để cửa sổ
   này chạy nền, không tắt đi.
4. Mở trang Kiosk trên trình duyệt của máy này như bình thường — khi hỏi trợ lý AI về Wi-Fi
   (hoặc bấm nút "Kết nối Wi-Fi"), khung chat sẽ tự lấy đúng SSID/mật khẩu của máy này và hiện
   mã QR để người dân quét.

## Chạy tự động mỗi khi bật máy (khuyến nghị cho máy Kiosk)

Vì dịch vụ cần chạy liên tục nền, nên đặt lịch tự khởi động bằng Task Scheduler:

1. Mở **Task Scheduler** → Create Task...
2. Tab **General**: đặt tên (VD "Kiosk Wifi Service"), chọn "Run whether user is logged on or not"
   nếu máy tự đăng nhập sẵn, hoặc để mặc định nếu máy luôn đăng nhập 1 tài khoản cố định.
3. Tab **Triggers** → New... → chọn "At log on".
4. Tab **Actions** → New... → Program/script: `node.exe` (hoặc đường dẫn đầy đủ, VD
   `C:\Program Files\nodejs\node.exe`); Add arguments: `server.js`; Start in: đường dẫn đầy đủ
   tới thư mục `wifi-local-service` này.
5. Lưu lại. Từ lần khởi động máy sau, dịch vụ sẽ tự chạy nền, không cần bấm file `.bat` nữa.

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
- Khung chat không hiện mã QR, không báo lỗi gì: dịch vụ chưa được khởi động trên máy này —
  mở lại `start-wifi-service.bat`.
- Tên mạng Wi-Fi hiện sai dấu tiếng Việt: đảm bảo đang chạy đúng bản `server.js` mới nhất (đã
  xử lý `chcp 65001` để đọc đúng UTF-8).
