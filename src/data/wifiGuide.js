// Huong dan ket noi Wi-Fi cho nguoi dan (nguoi lon tuoi, it dung cong nghe): cau chu cuc ky don
// gian, moi buoc 1 viec, kem bieu tuong. Dung chung cho: trang ket-noi-wifi.html, chatbot
// (rule-based) va AI (ngu canh can cu) - mot nguon duy nhat.
//
// NGUON & MUC XAC THUC: moi buoc ghi `sources` (khoa trong SOURCES) va `status`:
//   VERIFIED   - noi dung buoc khop voi trang tro giup chinh thuc da doc (xem SOURCES)
//   PARTIAL    - nguon chinh thuc chi xac nhan mot phan (ghi ro trong `note`)
//   UNVERIFIED - chua tim thay nguon chinh thuc, chi la kinh nghiem thong thuong - CAN thu tren may that
// Ten menu tieng Viet la BAN DICH tu ten menu tieng Anh trong nguon; giao dien that thay doi theo
// hang may va doi Android/iOS, nen moi buoc deu kem cau "Neu khong thay ... hay ..." va nut goi nhan vien.
// Ngay doc nguon: 20/09/2026.

const ACCESSED = '20/09/2026';

const SOURCES = {
  W1: { title: 'Google - Connect to Wi-Fi networks on your Android device', url: 'https://support.google.com/android/answer/9075847?hl=en', accessed: ACCESSED },
  W2: { title: 'Apple - Find and share your Wi-Fi password on iPhone (co phan ket noi Wi-Fi)', url: 'https://support.apple.com/guide/iphone/iph96e6aa9bb/ios', accessed: ACCESSED },
  W3: { title: 'Apple - Scan a QR code with your iPhone or iPad', url: 'https://support.apple.com/en-ke/102680', accessed: ACCESSED },
  W4: { title: 'Google Pixel - Scan QR codes with your Pixel phone', url: 'https://support.google.com/pixelphone/answer/16561572?hl=en', accessed: ACCESSED },
  W5: { title: 'ZXing - Barcode Contents (dinh dang ma QR Wi-Fi WIFI:T:...;S:...;P:...;;)', url: 'https://github.com/zxing/zxing/wiki/Barcode-Contents', accessed: ACCESSED }
};

const STATUS_LABELS = {
  VERIFIED: 'Đã đối chiếu nguồn chính thức',
  PARTIAL: 'Nguồn chính thức chỉ xác nhận một phần',
  UNVERIFIED: 'Chưa xác thực – cần thử trên máy thật'
};

const ANDROID_SCAN = {
  id: 'android',
  icon: '🤖',
  title: 'Điện thoại Android (Samsung, Oppo, Xiaomi, Vivo...)',
  intro: 'Cách nhanh nhất: dùng máy ảnh quét mã. Bạn không cần gõ mật khẩu.',
  steps: [
    { icon: '📷', text: 'Mở ứng dụng "Máy ảnh" (Camera) trên điện thoại.', sources: ['W4'], status: 'VERIFIED' },
    { icon: '🎯', text: 'Đưa máy ảnh vào mã QR trên màn hình này. Giữ yên khoảng 2–3 giây, cách màn hình chừng một gang tay.', sources: ['W4'], status: 'VERIFIED' },
    { icon: '👆', text: 'Khi điện thoại hiện dòng chữ kết nối mạng Wi-Fi, hãy chạm vào đó.', sources: ['W4'], status: 'PARTIAL',
      note: 'Trang Google chỉ nêu mã QR "có thể kết nối Wi-Fi"; chữ hiện ra chính xác khác nhau tùy hãng máy.' },
    { icon: '✅', text: 'Chờ vài giây. Thấy biểu tượng Wi-Fi ở góc trên màn hình là đã kết nối.', sources: [], status: 'UNVERIFIED' }
  ],
  ifNotWork: 'Máy ảnh không hiện gì? Thử cách khác: vuốt từ trên cùng màn hình xuống, tìm nút "Quét mã QR" (Scan QR code) rồi chạm vào. Vẫn không được thì làm theo cách "Nhập tay" bên dưới.',
  ifNotWorkSources: ['W4']
};

const IPHONE_SCAN = {
  id: 'iphone',
  icon: '🍎',
  title: 'iPhone',
  intro: 'iPhone cũng quét được bằng máy ảnh có sẵn.',
  steps: [
    { icon: '📷', text: 'Mở ứng dụng "Camera" (Máy ảnh) của iPhone.', sources: ['W3'], status: 'VERIFIED' },
    { icon: '🎯', text: 'Đưa camera vào mã QR trên màn hình này, giữ yên 2–3 giây.', sources: ['W3'], status: 'VERIFIED' },
    { icon: '👆', text: 'Khi phía trên màn hình hiện thông báo về mạng Wi-Fi, hãy chạm vào thông báo đó và chọn kết nối/tham gia.', sources: ['W3'], status: 'UNVERIFIED',
      note: 'Trang Apple đã đọc chỉ mô tả việc quét mã QR bằng Camera và chạm vào liên kết hiện ra; chưa thấy trang nào của Apple nêu rõ dòng chữ dành cho mã Wi-Fi. Định dạng mã QR Wi-Fi được nguồn W5 ghi là dùng được trên iOS 11 trở lên.' },
    { icon: '✅', text: 'Chờ vài giây. Thấy biểu tượng Wi-Fi ở góc trên màn hình là đã kết nối.', sources: [], status: 'UNVERIFIED' }
  ],
  ifNotWork: 'Camera không hiện thông báo? Có thể iPhone đời cũ. Hãy làm theo cách "Nhập tay" bên dưới.',
  ifNotWorkSources: ['W5']
};

const MANUAL_ANDROID = {
  id: 'manual-android',
  icon: '⌨️',
  title: 'Không quét được? Nhập tay trên Android',
  steps: [
    { icon: '⚙️', text: 'Mở "Cài đặt" (biểu tượng bánh răng).', sources: ['W1'], status: 'VERIFIED' },
    { icon: '🌐', text: 'Chạm "Mạng & internet", rồi chạm "Internet".', sources: ['W1'], status: 'PARTIAL',
      note: 'Nguồn ghi: Settings > Network & internet > Internet. Tên mục tiếng Việt có thể khác tùy hãng và đời máy; nhiều máy chỉ có mục "Wi-Fi" ngay trong Cài đặt.' },
    { icon: '🔎', text: 'Chạm vào tên mạng Wi-Fi: {SSID}. Mạng có mật khẩu sẽ có hình ổ khóa 🔒.', sources: ['W1'], status: 'VERIFIED' },
    { icon: '🔑', text: 'Gõ mật khẩu: {PASSWORD} rồi chạm "Kết nối".', sources: ['W1'], status: 'VERIFIED' },
    { icon: '➕', text: 'Không thấy tên mạng trong danh sách? Kéo xuống cuối danh sách, chạm "Thêm mạng" (Add network), gõ tên mạng và mật khẩu, rồi chạm "Lưu" (Save).', sources: ['W1'], status: 'VERIFIED' }
  ]
};

const MANUAL_IPHONE = {
  id: 'manual-iphone',
  icon: '⌨️',
  title: 'Không quét được? Nhập tay trên iPhone',
  steps: [
    { icon: '⚙️', text: 'Mở "Cài đặt" (Settings).', sources: ['W2'], status: 'VERIFIED' },
    { icon: '📶', text: 'Chạm "Wi-Fi".', sources: ['W2'], status: 'VERIFIED' },
    { icon: '🔎', text: 'Chọn tên mạng Wi-Fi: {SSID}.', sources: ['W2'], status: 'VERIFIED' },
    { icon: '🔑', text: 'Khi iPhone hỏi mật khẩu, gõ: {PASSWORD} rồi chạm "Tham gia" (Join).', sources: ['W2'], status: 'PARTIAL',
      note: 'Nguồn xác nhận "chọn mạng rồi nhập mật khẩu khi được hỏi"; tên nút "Tham gia/Join" là cách gọi thường thấy, chưa thấy nguồn Apple đã đọc ghi rõ.' }
  ]
};

const PASSWORD_TIPS = {
  title: 'Mẹo khi gõ mật khẩu',
  items: [
    'Chữ HOA và chữ thường khác nhau. Hãy gõ đúng từng chữ như trên màn hình.',
    'Chạm vào hình con mắt 👁 (nếu có) để xem mình đã gõ gì.',
    'Sai mật khẩu thì xóa đi gõ lại từ đầu, đừng gõ thêm vào sau.'
  ],
  sources: [],
  status: 'UNVERIFIED'
};

const STILL_STUCK = 'Vẫn chưa được? Bạn cứ nhờ nhân viên hỗ trợ tại Trung tâm giúp — không cần ngại. Có thể điện thoại quá cũ hoặc đang bật chế độ máy bay.';

const NOTES = [
  'Ảnh chụp màn hình thật chưa được đưa vào vì giao diện khác nhau theo hãng máy và đời Android/iOS; hiện dùng biểu tượng minh họa. Có thể bổ sung ảnh chụp từ máy thật của Trung tâm sau.',
  `Định dạng mã QR Wi-Fi: WIFI:T:<WPA|WEP|nopass>;S:<tên mạng>;P:<mật khẩu>;; — nguồn ${SOURCES.W5.url}.`,
  'Mạng Wi-Fi dạng "doanh nghiệp" (đăng nhập bằng tài khoản) không tạo được mã QR mật khẩu; khi đó chỉ hướng dẫn nhập tay.'
];

const GUIDE = { android: ANDROID_SCAN, iphone: IPHONE_SCAN, manualAndroid: MANUAL_ANDROID, manualIphone: MANUAL_IPHONE, passwordTips: PASSWORD_TIPS, stillStuck: STILL_STUCK, notes: NOTES };

// Thay {SSID}/{PASSWORD} trong cau chu bang gia tri that. Khi khong co (chat/AI khong duoc lo mat
// khau trong van ban, hoac chua cau hinh) thi dung cau tro toi khung Wi-Fi hien ben duoi.
function fill(text, net) {
  return text
    .replace('{SSID}', net && net.ssid ? `“${net.ssid}”` : '(tên mạng ghi trong khung Wi-Fi bên dưới)')
    .replace('{PASSWORD}', net && net.password ? `“${net.password}”` : '(mật khẩu ghi trong khung Wi-Fi bên dưới)');
}

// Chuyen 1 nhom huong dan thanh chuoi van ban danh so buoc cho chatbot (moi buoc 1 dong).
function toChatText(group, net) {
  const lines = group.steps.map((s, i) => `${i + 1}. ${s.icon} ${fill(s.text, net)}`);
  return `${group.title}\n${lines.join('\n')}`;
}

module.exports = { SOURCES, STATUS_LABELS, GUIDE, fill, toChatText };
