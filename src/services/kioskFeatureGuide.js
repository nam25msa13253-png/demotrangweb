// Huong dan cac tinh nang co dinh cua Kiosk (khong doi theo DB) - dung chung cho ca bo tra
// loi rule-based (ruleBasedAssistant.js) va du lieu can cu cua AI (chatbotService.js) de tranh
// lap lai noi dung o 2 noi va dam bao 2 co che tra loi giong nhau tuyet doi cho cung 1 cau hoi.
//
// Noi dung Wi-Fi va Nop ho so truc tuyen lay tu src/data/wifiGuide.js va src/data/dvcGuide.js
// (co nguon URL + muc xac thuc cho tung muc) - o day chi rut gon thanh van ban cho khung chat.
// Duong dan dang [chu](trang.html) duoc khung chat (public/js/chatbot.js) bien thanh lien ket bam duoc.
//
// `keywords`: moi phan tu la 1 chuoi (chi can chua chuoi do) HOAC 1 mang cac nhom, moi nhom la cac
// tu thay the nhau viet cach nhau bang "|" - TAT CA cac nhom deu phai co mat. VD ['wifi|wi-fi', 'iphone|ios']
// khop cau co (wifi hoac wi-fi) VA (iphone hoac ios). Muc dat truoc duoc uu tien khop truoc.
const wifiGuide = require('../data/wifiGuide');
const dvcGuide = require('../data/dvcGuide');

const WIFI_WORDS = 'wifi|wi-fi|wi fi|mang wifi';
const G = wifiGuide.GUIDE;
const FOOT_WIFI = '\nMã QR và mật khẩu hiện ở khung Wi-Fi ngay bên dưới. ' + wifiGuide.GUIDE.stillStuck
  + '\n[Xem hướng dẫn chữ to, có hình](ket-noi-wifi.html)';

const KIOSK_FEATURES = [
  {
    id: 'FORM_GUIDE',
    keywords: ['cach dien', 'huong dan dien', 'dien to khai', 'dien mau', 'dien giay to', 'viet to khai', 'dien don', 'dien phieu'],
    text: 'Hướng dẫn điền giấy tờ: Ở bước đối chiếu giấy tờ của từng thủ tục, bấm nút "Xem cách điền tờ khai" — hệ thống hướng dẫn từng ô trên tờ khai, có ví dụ minh họa (dữ liệu giả) và các lỗi thường gặp. Bạn cũng có thể mở trang "Cách điền giấy tờ" trên thanh menu. Quy tắc chung: dùng bút mực xanh/đen, viết họ tên đúng như CCCD, mục không có thì gạch ngang, không tẩy xóa, ký và ghi rõ họ tên ở cuối.'
  },
  {
    id: 'TICKET_NO_NAME',
    keywords: ['nhap ten', 'co can ten', 'so dien thoai de lay so', 'theo doi so', 'mat so thu tu', 'mat phieu'],
    text: 'Lấy số thứ tự: bạn KHÔNG cần nhập họ tên hay số điện thoại — chỉ cần chọn thủ tục, tích đủ giấy tờ rồi bấm "Xác nhận & Lấy số thứ tự". Trên phiếu có mã QR: quét bằng điện thoại để xem số người chờ phía trước và thời gian chờ ước tính. Nếu mất phiếu và không còn trang theo dõi, hãy báo nhân viên hỗ trợ.'
  },
  {
    id: 'WIFI_MANUAL',
    keywords: [[WIFI_WORDS, 'nhap tay|khong quet|quet khong|may cu|khong nhan ma|camera khong|khong co camera|go mat khau|thu cong|khong ket noi duoc|khong duoc']],
    text: 'Không quét được mã QR thì cứ nhập tay, rất dễ:\n\n' + wifiGuide.toChatText(G.manualAndroid, null)
      + '\n\n' + wifiGuide.toChatText(G.manualIphone, null) + '\n' + FOOT_WIFI
  },
  {
    id: 'WIFI_ANDROID',
    keywords: [[WIFI_WORDS, 'android|samsung|oppo|xiaomi|vivo|realme|nokia|huawei']],
    text: `${G.android.icon} ${G.android.title}\n${G.android.intro}\n` + G.android.steps.map((s, i) => `${i + 1}. ${s.icon} ${s.text}`).join('\n')
      + `\n${G.android.ifNotWork}\n` + FOOT_WIFI
  },
  {
    id: 'WIFI_IPHONE',
    keywords: [[WIFI_WORDS, 'iphone|ios|ipad|apple']],
    text: `${G.iphone.icon} ${G.iphone.title}\n${G.iphone.intro}\n` + G.iphone.steps.map((s, i) => `${i + 1}. ${s.icon} ${s.text}`).join('\n')
      + `\n${G.iphone.ifNotWork}\n` + FOOT_WIFI
  },
  {
    id: 'WIFI',
    keywords: ['wifi', 'wi-fi', 'wi fi', 'mang wifi', 'ket noi mang', 'internet'],
    text: 'Kết nối Wi-Fi rất đơn giản, không cần gõ mật khẩu:\n1. 📷 Mở ứng dụng Máy ảnh (Camera) trên điện thoại.\n2. 🎯 Đưa vào mã QR Wi-Fi ở khung bên dưới, giữ yên 2–3 giây.\n3. 👆 Chạm vào thông báo hiện ra để kết nối.\n'
      + 'Điện thoại không quét được? Hãy nhắn cho tôi: "Wi-Fi Android", "Wi-Fi iPhone" hoặc "Wi-Fi không quét được" để được hướng dẫn từng bước.\n[Xem hướng dẫn chữ to, có hình](ket-noi-wifi.html)'
  },
  {
    id: 'DVC',
    keywords: ['dvc', 'dich vu cong', 'nop truc tuyen', 'vneid', 'nop online', 'nop qua mang', 'nop ho so qua mang', 'nop ho so online', 'nop ho so truc tuyen', 'ho so truc tuyen', 'nop ho so tren mang', 'cong dich vu cong'],
    text: 'Nộp hồ sơ trực tuyến qua Cổng dịch vụ công quốc gia (dichvucong.gov.vn). Cần tài khoản VNeID đã kích hoạt (nhiều hướng dẫn nêu cần mức 2; mức 1 chưa xác thực được).\n'
      + dvcGuide.CHATBOT_SHORT_STEPS.join('\n')
      + '\nLưu ý: định dạng/dung lượng tệp tải lên, cách xử lý khi thanh toán lỗi, lỗi đăng nhập VNeID... tôi CHƯA xác thực được — hãy hỏi cán bộ hoặc gọi tổng đài của cổng.\n'
      + '[Xem hướng dẫn nộp hồ sơ trực tuyến chi tiết, có nguồn](nop-ho-so-truc-tuyen.html)'
  },
  {
    id: 'REENTRY',
    keywords: ['quet ma', 'bo sung ho so', 're-entry', 'reentry', 'ma qr', 'quet qr'],
    text: 'Quét mã Bổ sung hồ sơ (Re-entry): Dùng khi cán bộ quầy đã yêu cầu bổ sung giấy tờ còn thiếu và cấp cho bạn 1 mã QR Re-entry. Sau khi chuẩn bị đủ giấy tờ, bấm nút "Quét mã Bổ sung hồ sơ" ở màn hình chính, quét hoặc nhập mã đó để được xếp trở lại hàng đợi ưu tiên ngay, không phải lấy số mới từ đầu.'
  }
];

// Van ban cho AI (can cu): KHONG kem mat khau Wi-Fi, va liet ke ro nhung noi dung CHUA xac thuc
// de AI khong tu bia quy trinh.
function buildGuideText() {
  const main = KIOSK_FEATURES.map((f) => `- ${f.text}`).join('\n');
  const unverified = dvcGuide.UNVERIFIED_TOPICS.map((t) => `  + ${t}`).join('\n');
  return `${main}\n- CÁC NỘI DUNG VỀ NỘP HỒ SƠ TRỰC TUYẾN CHƯA XÁC THỰC (phải nói rõ là chưa xác thực và khuyên hỏi cán bộ, tuyệt đối không tự suy đoán):\n${unverified}`;
}

module.exports = { KIOSK_FEATURES, buildGuideText };
