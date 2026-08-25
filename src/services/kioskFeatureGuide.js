// Huong dan cac tinh nang co dinh cua Kiosk (khong doi theo DB) - dung chung cho ca bo tra
// loi rule-based (ruleBasedAssistant.js) va du lieu can cu cua AI (chatbotService.js) de tranh
// lap lai noi dung o 2 noi va dam bao 2 co che tra loi giong nhau tuyet doi cho cung 1 cau hoi.
const KIOSK_FEATURES = [
  {
    id: 'WIFI',
    keywords: ['wifi', 'wi-fi', 'wi fi', 'mang wifi', 'ket noi mang', 'internet'],
    text: 'Kết nối Wi-Fi: Bấm nút "Kết nối Wi-Fi" ở màn hình chính Kiosk để xem tên mạng (SSID) và mật khẩu Wi-Fi miễn phí của cơ sở, sau đó vào phần cài đặt Wi-Fi trên điện thoại/máy tính và nhập đúng thông tin đó.'
  },
  {
    id: 'DVC',
    keywords: ['dvc', 'dich vu cong', 'nop truc tuyen', 'vneid', 'nop online', 'nop qua mang'],
    text: 'Nộp trực tuyến qua Dịch vụ công (DVC): Bấm nút "Nộp trực tuyến (DVC)", chọn đúng mức định danh điện tử VNeID hiện tại của bạn. Nếu đã có VNeID mức 2, hệ thống sẽ hiện các bước nộp hồ sơ trực tuyến qua Cổng dịch vụ công quốc gia. Nếu chỉ có mức 1, cần nộp trực tiếp tại quầy.'
  },
  {
    id: 'REENTRY',
    keywords: ['quet ma', 'bo sung ho so', 're-entry', 'reentry', 'ma qr', 'quet qr'],
    text: 'Quét mã Bổ sung hồ sơ (Re-entry): Dùng khi cán bộ quầy đã yêu cầu bổ sung giấy tờ còn thiếu và cấp cho bạn 1 mã QR Re-entry. Sau khi chuẩn bị đủ giấy tờ, bấm nút "Quét mã Bổ sung hồ sơ" ở màn hình chính, quét hoặc nhập mã đó để được xếp trở lại hàng đợi ưu tiên ngay, không phải lấy số mới từ đầu.'
  }
];

function buildGuideText() {
  return KIOSK_FEATURES.map((f) => `- ${f.text}`).join('\n');
}

module.exports = { KIOSK_FEATURES, buildGuideText };
