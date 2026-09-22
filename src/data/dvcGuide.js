// Huong dan nop ho so truc tuyen tren Cong Dich vu cong quoc gia (dichvucong.gov.vn) cho nguoi dan.
// Dung chung cho trang nop-ho-so-truc-tuyen.html, chatbot (rule-based + AI) va API /api/kiosk/dvc/*.
//
// QUY TAC NOI DUNG (theo yeu cau cua nguoi dat hang):
//  - Moi buoc/loi ghi `sources` (khoa trong SOURCES, co URL) de can bo Trung tam doi chieu duoc.
//  - `status`: VERIFIED = cac nguon chinh thong da doc deu neu; PARTIAL = chi mot phan/nguon khong
//    dong nhat (ghi ro trong `note`); UNVERIFIED = CHUA tim thay nguon chinh thong - khong duoc
//    coi la quy trinh chinh thuc, chi de nguoi dan biet ma hoi can bo.
//  - KHONG suy dien quy trinh: cac muc chua xac thuc nam trong UNVERIFIED_TOPICS.
//  - Cac trang tin duoc doc qua cong cu tom tat noi dung (khong phai ban goc dang nguyen van) va
//    KHONG xem duoc noi dung hinh anh/video. Can bo nen mo lai tung URL de doi chieu truoc khi dung chinh thuc.
// Ngay doc nguon: 20/09/2026. Giao dien cong DVC co the thay doi sau ngay nay.

const ACCESSED = '20/09/2026';

const SOURCES = {
  S1: {
    title: 'Trung tâm Phục vụ hành chính công Hà Nội – Hướng dẫn công dân nộp hồ sơ trực tuyến trên Cổng dịch vụ công quốc gia (nguồn do người dùng cung cấp; chỉ đọc được phần chữ, không xem được nội dung video)',
    url: 'https://ttpvhcc.hanoi.gov.vn/video/huong-dan-cong-dan-nop-ho-so-truc-tuyen-tren-cong-dich-vu-cong-quoc-gia-2850260116085159336.htm',
    accessed: ACCESSED
  },
  S2: {
    title: 'Cổng thông tin điện tử Chính phủ (Thăng Long) – Hướng dẫn công dân các bước nộp hồ sơ trực tuyến, đơn giản, nhanh chóng (đăng 06/12/2025)',
    url: 'https://thanglong.chinhphu.vn/huong-dan-cong-dan-cac-buoc-nop-ho-so-truc-tuyen-don-gian-nhanh-chong-103251225090554341.htm',
    accessed: ACCESSED
  },
  S3: {
    title: 'Trang thông tin điện tử phường Vĩnh Tuy, Hà Nội – Hướng dẫn nộp hồ sơ trực tuyến trên Cổng dịch vụ công quốc gia (đăng 04/10/2025)',
    url: 'https://vinhtuy.hanoi.gov.vn/cchc-chuyen-doi-so/huong-dan-nop-ho-so-truc-tuyen-tren-cong-dich-vu-cong-quoc-gia-2823251013160715804.htm',
    accessed: ACCESSED
  },
  S4: {
    title: 'Cổng thông tin điện tử Chính phủ (Thăng Long) – Hướng dẫn thực hiện thủ tục "Cấp bản sao Trích lục hộ tịch, bản sao Giấy khai sinh" trên Cổng dịch vụ công quốc gia (ví dụ một thủ tục cụ thể)',
    url: 'https://thanglong.chinhphu.vn/huong-dan-cong-dan-thuc-hien-thu-tuc-hanh-chinh-truc-tuyen-cap-ban-sao-trich-luc-ho-tich-ban-sao-giay-khai-sinh-tren-cong-dich-vu-cong-quoc-gia-103251224055949183.htm',
    accessed: ACCESSED
  },
  S5: {
    title: 'VNeID (Bộ Công an) – Hướng dẫn đăng ký/kích hoạt tài khoản VNeID',
    url: 'https://vneid.gov.vn/huongdan/huong-dan-dang-ky-tai-khoan-vneid.html',
    accessed: ACCESSED
  },
  S6: {
    title: 'Cổng Dịch vụ công quốc gia – Tra cứu hồ sơ (có tổng đài và email hỗ trợ)',
    url: 'https://vpcp.dichvucong.gov.vn/p/home/dvc-tra-cuu-ho-so.html',
    accessed: ACCESSED
  },
  S7: {
    title: 'Báo Xây dựng chính sách (Chính phủ) – Quy định mới trình tự, thủ tục, thời hạn cấp tài khoản định danh điện tử với công dân Việt Nam từ 1/7 (đăng 28/06/2024)',
    url: 'https://xaydungchinhsach.chinhphu.vn/quy-dinh-moi-trinh-tu-thu-tuc-thoi-han-cap-tai-khoan-dinh-danh-dien-tu-voi-cong-dan-viet-nam-tu-1-7-119240626100258774.htm',
    accessed: ACCESSED
  },
  S8: {
    title: 'Cổng Dịch vụ công quốc gia – Phản ánh, kiến nghị của người dân về lỗi nộp hồ sơ trực tuyến (ví dụ một phản ánh; mới thấy tiêu đề trong kết quả tìm kiếm, chưa mở đọc nội dung nên chưa biết nguyên nhân)',
    url: 'https://dichvucong.gov.vn/p/phananhkiennghi/pakn-detail.html?id=2D7B777BE41B0CAAE063490AA8C07866',
    accessed: ACCESSED
  },
  S9: {
    title: 'Cổng Dịch vụ công quốc gia – trang chủ (nơi đăng nhập và nộp hồ sơ)',
    url: 'https://dichvucong.gov.vn/',
    accessed: ACCESSED
  }
};

const STATUS_LABELS = {
  VERIFIED: 'Đã đối chiếu nguồn chính thống',
  PARTIAL: 'Nguồn chỉ xác nhận một phần / các nguồn không thống nhất',
  UNVERIFIED: 'Chưa xác thực – hãy hỏi cán bộ'
};

// ----- Dieu kien truoc khi nop -----
const PREREQUISITES = [
  {
    icon: '📱', title: 'Có tài khoản VNeID trên điện thoại',
    simple: 'Bạn cần ứng dụng "VNeID" (của Bộ Công an) đã kích hoạt.',
    details: [
      'Tài khoản mức 1: tự đăng ký ngay trên ứng dụng VNeID, xử lý không quá 1 ngày làm việc nếu căn cước còn hiệu lực (nguồn S7).',
      'Tài khoản mức 2: phải đến trực tiếp cơ quan Công an (công an xã/phường hoặc nơi cấp căn cước), mang theo thẻ căn cước và điền phiếu đề nghị; cán bộ xác thực khuôn mặt và vân tay; không quá 3 ngày làm việc nếu căn cước còn hiệu lực (nguồn S7). Hà Nội có thể làm tại xã/phường/thị trấn (nguồn S5).',
      'Sau khi được duyệt, bạn nhận tin nhắn SMS rồi kích hoạt tài khoản trong ứng dụng VNeID (nguồn S5).'
    ],
    sources: ['S5', 'S7'], status: 'VERIFIED'
  },
  {
    icon: '🪪', title: 'Cần tài khoản mức 1 hay mức 2?',
    simple: 'Nhiều hướng dẫn nói cần mức 2. Mức 1 thì CHƯA chắc nộp được — hãy hỏi cán bộ.',
    details: [
      'Bài hướng dẫn thủ tục "Cấp bản sao Trích lục hộ tịch" ghi rõ cần tài khoản định danh mức 2 (nguồn S4).',
      'Hai bài hướng dẫn chung ghi: đăng nhập bằng VNeID hoặc bằng tài khoản do Cổng dịch vụ công cấp (nguồn S2, S3) – không nêu rõ mức.',
      'Các nguồn đã đọc KHÔNG nêu rõ tài khoản mức 1 có nộp được hồ sơ hay không. Đây là điểm chưa xác thực.'
    ],
    sources: ['S2', 'S3', 'S4'], status: 'PARTIAL'
  },
  {
    icon: '🗂️', title: 'Chuẩn bị giấy tờ dạng ảnh chụp/bản scan',
    simple: 'Chụp hoặc scan giấy tờ thành tệp trên điện thoại/máy tính để tải lên.',
    details: [
      'Bạn sẽ tải lên tệp của từng giấy tờ trong hồ sơ (nguồn S2). Cổng cho phép lấy tài liệu từ thiết bị, tài liệu mẫu hoặc danh sách tài liệu điện tử cá nhân (nguồn S1).',
      'Loại tệp và dung lượng tối đa được phép: CHƯA xác thực (xem mục "Chưa xác thực" bên dưới).'
    ],
    sources: ['S1', 'S2'], status: 'PARTIAL'
  }
];

// ----- Cac buoc nop ho so -----
const STEPS = [
  {
    no: 1, icon: '🌐', title: 'Mở Cổng dịch vụ công quốc gia',
    simple: 'Trên điện thoại hoặc máy tính, mở trình duyệt và gõ: dichvucong.gov.vn',
    details: ['Địa chỉ chính thức: https://dichvucong.gov.vn/'],
    sources: ['S1', 'S2', 'S3', 'S9'], status: 'VERIFIED'
  },
  {
    no: 2, icon: '🔐', title: 'Đăng nhập bằng VNeID',
    simple: 'Bấm nút "Đăng nhập", chọn đăng nhập bằng tài khoản định danh điện tử VNeID.',
    details: [
      'Cách 1: nhập số định danh cá nhân (số căn cước) và mật khẩu VNeID.',
      'Cách 2: quét mã QR trên màn hình bằng ứng dụng VNeID trên điện thoại.'
    ],
    sources: ['S1', 'S2'], status: 'VERIFIED'
  },
  {
    no: 3, icon: '🔎', title: 'Tìm thủ tục cần làm',
    simple: 'Chọn "Dịch vụ công trực tuyến", gõ tên thủ tục (ví dụ: khai sinh) rồi bấm "Tìm kiếm".',
    details: [],
    sources: ['S1', 'S3'], status: 'VERIFIED'
  },
  {
    no: 4, icon: '📍', title: 'Chọn thủ tục và nơi giải quyết',
    simple: 'Bấm vào đúng thủ tục. Chọn tỉnh/thành phố (ví dụ Hà Nội) rồi bấm "Đồng ý".',
    details: [
      'Một số thủ tục yêu cầu chọn cơ quan thực hiện, ví dụ UBND xã/phường hoặc Sở (nguồn S2). Nên chọn nơi đúng với địa chỉ cư trú của bạn (nguồn S4 nêu chọn thủ tục phù hợp địa chỉ thường trú/tạm trú).'
    ],
    sources: ['S1', 'S2', 'S3', 'S4'], status: 'VERIFIED'
  },
  {
    no: 5, icon: '👉', title: 'Bấm "Nộp trực tuyến"',
    simple: 'Trong trang chi tiết thủ tục, bấm nút "Nộp trực tuyến".',
    details: [],
    sources: ['S1', 'S3', 'S4'], status: 'VERIFIED'
  },
  {
    no: 6, icon: '✍️', title: 'Điền thông tin và tải giấy tờ lên',
    simple: 'Điền các ô có dấu sao đỏ (*) – đó là ô bắt buộc. Bấm nút tải lên để chọn ảnh/scan giấy tờ.',
    details: [
      'Xem tờ khai: bấm biểu tượng tờ giấy; tải tệp: bấm biểu tượng mũi tên hướng lên (nguồn S4).',
      'Tên hồ sơ không để trống, không viết tắt; số lượng bản (nếu có) phải khớp giữa các mục (nguồn S4, viết cho thủ tục cấp bản sao trích lục).',
      'Điền xong bấm "Lưu và nộp hồ sơ" (nguồn S1, S4).',
      'Cách điền từng ô của tờ khai giấy có ở trang "Cách điền giấy tờ" của hệ thống này; tờ khai điện tử trên cổng có thể khác về hình thức – CHƯA đối chiếu.'
    ],
    sources: ['S1', 'S2', 'S4'], status: 'VERIFIED'
  },
  {
    no: 7, icon: '📮', title: 'Chọn cách nhận kết quả',
    simple: 'Muốn nhận kết quả bản giấy tại nhà thì tích chọn "dịch vụ bưu chính công ích" và điền địa chỉ nhận.',
    details: ['Nếu không chọn, bạn nhận kết quả theo phiếu hẹn (xem bước 10).'],
    sources: ['S2'], status: 'PARTIAL'
  },
  {
    no: 8, icon: '💳', title: 'Thanh toán phí, lệ phí (nếu có)',
    simple: 'Sau khi nộp, màn hình hiện "Thông tin thanh toán". Dùng mã QR trên màn hình để trả tiền. Thấy chữ "Thanh toán thành công!" là hồ sơ đã được gửi đi.',
    details: [
      'Chỉ thủ tục có phí/lệ phí mới phải thanh toán (nguồn S1).',
      'Ngân hàng/ví điện tử nào quét được mã, thời hạn phải thanh toán, và cách xử lý khi trả tiền rồi mà chưa thấy báo thành công: CHƯA xác thực.'
    ],
    sources: ['S1'], status: 'PARTIAL'
  },
  {
    no: 9, icon: '📝', title: 'Ghi nhớ "Mã hồ sơ"',
    simple: 'Chụp màn hình hoặc ghi lại Mã hồ sơ. Cần mã này để tra cứu sau.',
    details: [],
    sources: ['S4'], status: 'VERIFIED'
  },
  {
    no: 10, icon: '👀', title: 'Theo dõi hồ sơ',
    simple: 'Có 2 cách xem hồ sơ đến đâu rồi.',
    details: [
      'Cách 1: bấm "Thông tin và dịch vụ" → "Tra cứu hồ sơ" → nhập Mã hồ sơ (nguồn S1). Trang tra cứu còn hỏi thêm "Mã bảo mật" (chữ/số hiện trên hình) (nguồn S6).',
      'Cách 2: vào "Thông tin cá nhân" → "Dịch vụ công của tôi" để xem danh sách hồ sơ của bạn (nguồn S1).',
      'Hà Nội cũng có trang tra cứu riêng tại dichvucong.hanoi.gov.vn (chưa đọc được hướng dẫn chi tiết của trang này).'
    ],
    sources: ['S1', 'S6'], status: 'VERIFIED'
  },
  {
    no: 11, icon: '📬', title: 'Nhận kết quả',
    simple: 'Hệ thống cho bạn "phiếu hẹn trả kết quả". Đến đúng ngày hẹn hoặc chờ bưu điện giao (nếu bạn đã chọn).',
    details: [
      'Thủ tục "trực tuyến một phần": ngoài nộp online, bạn còn phải mang bản giấy đến Trung tâm/Chi nhánh theo quy định (nguồn S1, S3).',
      'Cách nhận kết quả điện tử (nếu có): CHƯA xác thực.'
    ],
    sources: ['S1', 'S3'], status: 'VERIFIED'
  }
];

// ----- Loi/luu y thuong gap (chi nhung dieu co nguon; suy luan ghi ro) -----
const COMMON_PROBLEMS = [
  {
    problem: 'Bỏ trống ô có dấu sao đỏ (*)',
    advice: 'Ô có dấu sao là bắt buộc. Điền đủ mới nộp được.',
    sources: ['S1', 'S4'], status: 'VERIFIED'
  },
  {
    problem: 'Để trống hoặc viết tắt "Tên hồ sơ"; số lượng bản không khớp giữa các mục',
    advice: 'Ghi tên hồ sơ đầy đủ, không viết tắt; kiểm tra số lượng bản ở mọi mục cho giống nhau. (Nguồn nêu cho thủ tục cấp bản sao trích lục; thủ tục khác có thể có yêu cầu riêng.)',
    sources: ['S4'], status: 'PARTIAL'
  },
  {
    problem: 'Muốn sửa thông tin sau khi cán bộ đã tiếp nhận',
    advice: 'Sau khi cán bộ tiếp nhận, bạn không tự sửa được, chỉ bổ sung khi được yêu cầu. Vì vậy hãy kiểm tra kỹ trước khi bấm "Lưu và nộp hồ sơ".',
    sources: ['S1'], status: 'VERIFIED'
  },
  {
    problem: 'Quên lưu Mã hồ sơ',
    advice: 'Có mã mới tra cứu được nhanh. Nếu lỡ quên, vào "Thông tin cá nhân" → "Dịch vụ công của tôi" để xem lại danh sách hồ sơ đã nộp.',
    sources: ['S1', 'S4'], status: 'VERIFIED'
  },
  {
    problem: 'Thủ tục "trực tuyến một phần" nhưng quên mang bản giấy đến Trung tâm',
    advice: 'Hồ sơ nộp online chưa đủ. Hãy mang bản giấy đến Trung tâm/Chi nhánh theo phiếu hẹn/thông báo.',
    sources: ['S1', 'S3'], status: 'VERIFIED'
  },
  {
    problem: 'Chưa có VNeID hoặc chưa kích hoạt / không đăng nhập được',
    advice: 'Tài khoản mức 2 phải làm trực tiếp tại cơ quan Công an và chờ duyệt (không quá 3 ngày làm việc nếu căn cước còn hiệu lực), rồi kích hoạt trong ứng dụng bằng tin nhắn SMS. Trong lúc chờ, bạn có thể nộp trực tiếp tại quầy. Nguyên nhân cụ thể của lỗi đăng nhập: chưa xác thực – gọi tổng đài hoặc hỏi cán bộ.',
    sources: ['S5', 'S7'], status: 'PARTIAL'
  },
  {
    problem: 'Nộp mãi không được, hoặc nộp xong không thấy hồ sơ trong mục tra cứu',
    advice: 'Có người dân đã phản ánh lỗi này trên cổng, nhưng các nguồn đã đọc CHƯA nêu nguyên nhân hay cách xử lý. Hãy chụp màn hình lỗi, thử lại sau, gọi tổng đài hỗ trợ của cổng hoặc mang giấy tờ đến nộp trực tiếp tại quầy.',
    sources: ['S8', 'S6'], status: 'UNVERIFIED'
  }
];

// ----- Nhung noi dung CHUA xac thuc duoc - khong tu suy dien -----
const UNVERIFIED_TOPICS = [
  'Định dạng tệp (ảnh, PDF...) và dung lượng tối đa được phép tải lên.',
  'Ngân hàng/ví điện tử nào quét được mã thanh toán; thời hạn thanh toán; cách xử lý khi đã trả tiền mà chưa thấy báo "Thanh toán thành công".',
  'Tài khoản VNeID mức 1 có nộp được hồ sơ hay không (các nguồn không nêu rõ); có thủ tục nào chỉ yêu cầu mức 2 hay không.',
  'Nguyên nhân và cách xử lý các lỗi đăng nhập VNeID hoặc lỗi hệ thống của cổng.',
  'Cách nhận kết quả dạng điện tử (nếu có) sau khi hồ sơ được giải quyết.',
  'Thời gian xử lý, lệ phí cụ thể của từng thủ tục: xem trong trang chi tiết thủ tục trên cổng, hoặc mục "Lệ phí/Thời gian" của hệ thống này (dữ liệu mẫu, cần cán bộ Trung tâm xác nhận).',
  'Giờ làm việc của Trung tâm Phục vụ hành chính công Hà Nội: trang chủ ttpvhcc.hanoi.gov.vn (đã đọc ngày 20/09/2026) không đăng giờ làm việc; cần xác nhận trực tiếp với Trung tâm.',
  'Nội dung hình ảnh/video trong nguồn S1 (video hướng dẫn): chỉ đọc được phần chữ mô tả, không xem được video.'
];

const SUPPORT = {
  note: 'Thông tin liên hệ lấy từ trang tra cứu của Cổng dịch vụ công quốc gia (nguồn S6). Một bài hướng dẫn khác (nguồn S4) nêu số tổng đài 19001009 – hai nguồn không giống nhau, cần đối chiếu trước khi in ra dùng.',
  phone: '18001096',
  altPhoneFromOtherSource: '19001009',
  email: 'dichvucong@chinhphu.vn',
  sources: ['S6', 'S4'],
  status: 'PARTIAL'
};

const INTRO = 'Nộp hồ sơ qua mạng giúp bạn không phải đi lại nhiều lần. Bạn làm được ngay tại nhà bằng điện thoại hoặc máy tính. Làm chậm rãi từng bước, chỗ nào chưa chắc cứ hỏi cán bộ.';

const CHATBOT_SHORT_STEPS = STEPS.map((s) => `${s.no}. ${s.icon} ${s.title}: ${s.simple}`);

module.exports = {
  SOURCES, STATUS_LABELS, INTRO, PREREQUISITES, STEPS, COMMON_PROBLEMS, UNVERIFIED_TOPICS, SUPPORT, CHATBOT_SHORT_STEPS
};
