// Noi dung "Huong dan dien giay to" cho nguoi dan - du lieu mac dinh (seed) cua cot
// form_templates.fill_guide va cua goi y "cach co giay to nay" tren Kiosk.
//
// LUU Y NOI DUNG: day la huong dan CHUNG, mo ta cac muc thuong gap tren to khai hanh chinh de
// nguoi dan bot bo ngo - KHONG thay the mau bieu chinh thuc do co quan nha nuoc ban hanh (mau
// co the thay doi theo tung thoi diem/dia phuong). Moi truong hop chua chac, nguoi dan hoi can
// bo ho tro. Ten/so giay to trong phan "example" deu la DU LIEU GIA de minh hoa.
// Admin co the sua lai tung to khai qua PUT /api/admin/form-templates (truong fill_guide).

// ---------------------------------------------------------------------------------------
// Quy tac chung khi dien MOI loai giay to (hien tren trang huong dan dien mau).
// ---------------------------------------------------------------------------------------
const GENERAL_RULES = [
  { icon: '🖊️', title: 'Dùng bút mực xanh hoặc đen', text: 'Không dùng bút chì, bút đỏ hay bút xóa. Viết chữ rõ ràng, dễ đọc, in hoa có dấu ở phần họ tên.' },
  { icon: '🪪', title: 'Họ tên giống hệt trên CCCD', text: 'Ghi đúng từng chữ, đúng dấu như trên Căn cước công dân. Sai một dấu cũng có thể khiến hồ sơ bị trả lại.' },
  { icon: '📅', title: 'Ngày tháng theo dương lịch', text: 'Ghi đủ ngày/tháng/năm, ví dụ 05/03/1990. Tháng 1 đến tháng 9 nên ghi thêm số 0 phía trước cho dễ đọc.' },
  { icon: '➖', title: 'Mục không có thì gạch ngang', text: 'Đừng để trống. Nếu không có thông tin cho ô nào, hãy gạch một đường ngang (–) hoặc ghi "Không".' },
  { icon: '🚫', title: 'Không tẩy xóa, không viết đè', text: 'Nếu viết sai, hãy xin một tờ mẫu mới tại bàn viết thay vì sửa. Tờ khai bị tẩy xóa thường không được nhận.' },
  { icon: '✍️', title: 'Ký và ghi rõ họ tên ở cuối', text: 'Ký bằng chính chữ ký của bạn, ghi rõ họ tên bên dưới. Nên ký tại quầy nếu cán bộ yêu cầu ký trước mặt.' },
  { icon: '🙋', title: 'Chưa chắc thì hỏi', text: 'Cán bộ hỗ trợ ở bàn viết sẵn sàng giúp bạn điền. Bạn có thể nhờ người thân đi cùng đọc và kiểm tra lại giúp.' }
];

// ---------------------------------------------------------------------------------------
// Goi y "cach co giay to nay / can mang gi" theo MA giay to (required_docs[].code).
// ---------------------------------------------------------------------------------------
const DOC_HINTS = {
  CMND: 'Mang bản chính để cán bộ đối chiếu ảnh và số. Nên dùng thẻ CCCD; nếu bạn còn giữ CMND 9 số, hãy hỏi cán bộ xem có còn được chấp nhận không.',
  CCCD: 'Mang bản chính thẻ Căn cước công dân còn hiệu lực. Với thủ tục cần hai bên (vợ chồng, bên chuyển nhượng...), cả hai người đều phải có thẻ.',
  GCN_SINH: 'Do bệnh viện/cơ sở y tế nơi bé chào đời cấp. Nếu sinh tại nhà hoặc mất giấy, hãy hỏi cán bộ về giấy tờ thay thế.',
  XNTTHN: 'Do UBND xã/phường nơi bạn cư trú cấp. Chưa có thì làm thủ tục "Xác nhận tình trạng hôn nhân" ngay tại Trung tâm này trước.',
  GIAYBAOTU: 'Do cơ sở y tế nơi người mất được điều trị cấp. Nếu mất ở nhà, hãy hỏi cán bộ về giấy tờ thay thế (giấy chứng tử tạm, xác nhận của cơ quan/người làm chứng).',
  GCNQSDD: 'Bản chính "sổ đỏ/sổ hồng" đang do bạn giữ. Nếu đang thế chấp ngân hàng, cần hỏi cán bộ về văn bản đồng ý hoặc giải chấp.',
  HDCN: 'Hợp đồng chuyển nhượng phải được công chứng (làm tại Văn phòng công chứng). Mang bản chính đã có dấu công chứng.',
  NGUONGOCDAT: 'Giấy tờ chứng minh nguồn gốc đất: quyết định giao đất, giấy mua bán/tặng cho/thừa kế, xác nhận của UBND... Mang tất cả những gì bạn đang có.',
  SODOTACHTHUA: 'Sơ đồ/bản vẽ tách thửa do đơn vị đo đạc có chức năng lập. Nếu chưa có, hãy hỏi cán bộ về nơi lập sơ đồ.',
  GIAYTOCHUNGMINH: 'Giấy tờ thể hiện thông tin ĐÚNG mà bạn muốn cải chính: ví dụ giấy khai sinh gốc, CCCD, sổ hộ tịch, giấy tờ học bạ.',
  GCNDKKD_CU: 'Giấy chứng nhận đăng ký hộ kinh doanh bạn đã được cấp trước đây (bản chính).',
  GCNDKKD: 'Giấy chứng nhận đăng ký hộ kinh doanh đã được cấp (bản chính).',
  THONGTIN_SUKIEN: 'Không bắt buộc. Nếu nhớ số, quyển, ngày đăng ký thì ghi ra giấy nhỏ mang theo để cán bộ tra cứu nhanh hơn.',
  TBTAMNGUNG: 'Thông báo tạm ngừng kinh doanh viết theo mẫu tại bàn viết. Ghi rõ thời gian tạm ngừng (từ ngày nào đến ngày nào).'
};

// ---------------------------------------------------------------------------------------
// Ham dung nhanh cac muc lap lai o nhieu to khai.
// ---------------------------------------------------------------------------------------
const f = (label, how, example) => ({ label, how, example });

const KINH_GUI = f(
  'Kính gửi',
  'Ghi tên cơ quan tiếp nhận hồ sơ – thường là UBND xã/phường/thị trấn nơi bạn nộp. Nếu không chắc, hỏi cán bộ ở quầy hoặc chép đúng tên cơ quan đang in trên bảng hiệu.',
  'UBND phường Dịch Vọng'
);
const NGUOI_KHAI = f(
  'Họ, chữ đệm, tên người khai',
  'Viết IN HOA có dấu, đúng từng chữ như trên Căn cước công dân của bạn.',
  'NGUYỄN VĂN AN'
);
const GIAY_TO_TUY_THAN = f(
  'Giấy tờ tùy thân (số, ngày cấp, nơi cấp)',
  'Nhìn mặt trước và mặt sau thẻ CCCD: số định danh gồm 12 chữ số, ngày cấp và nơi cấp in trên thẻ. Chép nguyên văn, không viết tắt.',
  'CCCD số 001090012345, cấp ngày 12/08/2021, Cục Cảnh sát QLHC về TTXH'
);
const NOI_CU_TRU = f(
  'Nơi cư trú',
  'Ghi đầy đủ từ nhỏ đến lớn: số nhà/thôn – phường/xã – quận/huyện – tỉnh/thành. Ghi nơi bạn đang cư trú hợp pháp, giống thông tin cư trú trên hệ thống dân cư.',
  'Số 12 ngõ 34, phường Dịch Vọng, quận Cầu Giấy, Hà Nội'
);
const CAM_DOAN_KY = f(
  'Cam đoan, ngày tháng, ký tên',
  'Đọc kỹ dòng cam đoan (bạn xác nhận thông tin đúng sự thật). Ghi ngày/tháng/năm thực tế bạn điền, ký tên và ghi rõ họ tên bên dưới. Khai sai sự thật bạn phải chịu trách nhiệm.',
  'Hà Nội, ngày 20 tháng 09 năm 2026 – (ký) NGUYỄN VĂN AN'
);
const SO_DIEN_THOAI = f(
  'Số điện thoại liên hệ',
  'Ghi số điện thoại bạn đang dùng để cơ quan gọi khi cần bổ sung. Không có thì gạch ngang.',
  '0912 345 678'
);

const LOI_CHUNG = [
  'Viết họ tên khác với CCCD (thiếu dấu, viết tắt, đảo chữ đệm).',
  'Để trống ô không có thông tin thay vì gạch ngang.',
  'Quên ký tên hoặc ký nhưng không ghi rõ họ tên.',
  'Dùng bút chì hoặc bút xóa, viết đè lên chữ cũ.'
];
const SAU_KHI_DIEN = [
  'Đọc lại từ trên xuống dưới, so họ tên và số CCCD với thẻ thật.',
  'Kiểm tra đã ký tên và ghi rõ họ tên chưa.',
  'Kẹp tờ khai cùng các giấy tờ còn lại theo đúng danh sách trên màn hình Kiosk.',
  'Quay lại Kiosk bấm "Xác nhận & Lấy số thứ tự" rồi chờ được gọi.'
];

// ---------------------------------------------------------------------------------------
// Huong dan dien tung to khai. Ma serviceCode phai khop bang `services`; formCode la ma to
// khai (form_templates.form_code, UNIQUE). Vi tri ke/khay/ban viet la GIA TRI MAU - Admin sua
// cho dung voi bo tri that tai co so.
// ---------------------------------------------------------------------------------------
const FORM_GUIDES = [
  {
    serviceCode: 'KHAISINH', formCode: 'TK-KS-01', formName: 'Tờ khai đăng ký khai sinh',
    shelf: 'Kệ A', tray: 'Khay 1', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_KS',
    intro: 'Dùng để đăng ký khai sinh cho bé. Bạn nên mang theo Giấy chứng sinh để chép chính xác ngày giờ và nơi sinh.',
    fields: [
      KINH_GUI,
      f('Họ tên, giấy tờ tùy thân người đi khai', 'Thường là cha hoặc mẹ. Điền họ tên IN HOA và thông tin CCCD như trên thẻ.', 'NGUYỄN VĂN AN – CCCD 001090012345'),
      f('Quan hệ với người được khai sinh', 'Ghi bạn là gì của bé: cha, mẹ, ông, bà, người thân khác.', 'Cha'),
      f('Họ, chữ đệm, tên của bé', 'Viết IN HOA có dấu. Cân nhắc kỹ vì tên sau khi đăng ký rất khó thay đổi.', 'NGUYỄN MINH KHOA'),
      f('Ngày, tháng, năm sinh; giờ sinh', 'Chép đúng theo Giấy chứng sinh. Ghi dương lịch.', '05/03/2026 – 08 giờ 30'),
      f('Giới tính, dân tộc, quốc tịch', 'Khoanh/ghi theo thực tế. Dân tộc và quốc tịch của bé thường theo cha mẹ.', 'Nam – Kinh – Việt Nam'),
      f('Nơi sinh', 'Chép tên cơ sở y tế và địa danh đúng như Giấy chứng sinh.', 'Bệnh viện Phụ sản Hà Nội, quận Hoàn Kiếm, Hà Nội'),
      f('Thông tin của mẹ và của cha', 'Điền họ tên, năm sinh, dân tộc, quốc tịch, nơi cư trú của từng người. Không có thông tin cha (nếu chưa xác định) thì gạch ngang và hỏi cán bộ.', 'Mẹ: TRẦN THỊ HOA, sinh 1992, Kinh, Việt Nam'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ghi ngày sinh khác với Giấy chứng sinh.',
      'Ghi tên cha mẹ có dấu/không dấu khác với CCCD của họ.',
      ...LOI_CHUNG.slice(2)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'KETHON', formCode: 'TK-KH-01', formName: 'Tờ khai đăng ký kết hôn',
    shelf: 'Kệ A', tray: 'Khay 3', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_KH',
    intro: 'Hai bên nam nữ cùng điền và cùng ký. Chuẩn bị sẵn CCCD của cả hai và Giấy xác nhận tình trạng hôn nhân.',
    fields: [
      KINH_GUI,
      f('Thông tin bên nam', 'Họ tên IN HOA, ngày sinh, dân tộc, quốc tịch, nơi cư trú, số CCCD của người chồng – chép từ CCCD.', 'NGUYỄN VĂN AN, sinh 05/03/1990, Kinh, Việt Nam'),
      f('Thông tin bên nữ', 'Điền tương tự cho người vợ, chép từ CCCD của cô dâu.', 'TRẦN THỊ HOA, sinh 12/07/1992, Kinh, Việt Nam'),
      f('Tình trạng hôn nhân của mỗi bên', 'Ghi đúng theo Giấy xác nhận tình trạng hôn nhân: chưa đăng ký kết hôn, hoặc đã ly hôn theo bản án số... (nếu có).', 'Chưa đăng ký kết hôn lần nào'),
      f('Cam đoan của hai bên', 'Cả hai đọc kỹ: tự nguyện, không vi phạm điều cấm (như chưa đủ tuổi, đang có vợ/chồng). Sai sự thật phải chịu trách nhiệm.', ''),
      f('Ngày tháng và chữ ký của cả hai', 'Mỗi người tự ký và ghi rõ họ tên của mình vào phần của mình.', 'Ngày 20 tháng 09 năm 2026 – (ký) AN – (ký) HOA')
    ],
    mistakes: [
      'Chỉ một bên ký, bên còn lại quên ký.',
      'Tình trạng hôn nhân ghi không khớp Giấy xác nhận.',
      ...LOI_CHUNG.slice(0, 2)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'KHAITU', formCode: 'TK-KT-01', formName: 'Tờ khai đăng ký khai tử',
    shelf: 'Kệ A', tray: 'Khay 4', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_KT',
    intro: 'Người thân đi khai. Mang Giấy báo tử và CCCD của người khai (và của người đã mất nếu còn).',
    fields: [
      KINH_GUI,
      { ...NGUOI_KHAI, label: 'Họ tên người đi khai' },
      GIAY_TO_TUY_THAN,
      f('Quan hệ với người đã mất', 'Ghi bạn là gì của người mất: con, vợ/chồng, cháu, anh/chị/em...', 'Con'),
      f('Họ tên và năm sinh người đã mất', 'Chép đúng như CCCD hoặc giấy khai sinh của người mất.', 'NGUYỄN VĂN BÌNH – sinh 1950'),
      f('Ngày giờ mất và nơi mất', 'Chép đúng theo Giấy báo tử. Ghi rõ tên bệnh viện hoặc địa chỉ nơi mất.', '14/09/2026, 22 giờ 15 – Bệnh viện Bạch Mai, Hà Nội'),
      f('Nguyên nhân mất', 'Ghi theo Giấy báo tử. Nếu không có ghi rõ, ghi "Theo Giấy báo tử".', 'Bệnh'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ngày giờ mất khác với Giấy báo tử.',
      ...LOI_CHUNG.slice(1)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'XNTTHN', formCode: 'TK-XNHN-01', formName: 'Tờ khai xác nhận tình trạng hôn nhân',
    shelf: 'Kệ A', tray: 'Khay 5', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_XNHN',
    intro: 'Dùng khi cần giấy chứng minh bạn đang độc thân/đã ly hôn (ví dụ để đăng ký kết hôn).',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      NOI_CU_TRU,
      f('Mục đích sử dụng giấy xác nhận', 'Ghi ngắn gọn bạn cần giấy này để làm gì. Không ghi thì có thể bị hỏi lại.', 'Để đăng ký kết hôn'),
      f('Tình trạng hôn nhân hiện tại', 'Ghi đúng sự thật: chưa đăng ký kết hôn / đã ly hôn (theo bản án, quyết định số...) / góa vợ (chồng).', 'Chưa đăng ký kết hôn'),
      f('Thời gian cư trú tại nơi xin xác nhận', 'Nếu bạn từng ở nơi khác trong những năm gần đây, hãy ghi rõ để cán bộ xác minh.', 'Từ 2018 đến nay'),
      CAM_DOAN_KY
    ],
    mistakes: LOI_CHUNG,
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'CAICHINH_HT', formCode: 'TK-CC-01', formName: 'Tờ khai cải chính hộ tịch',
    shelf: 'Kệ A', tray: 'Khay 6', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_CC',
    intro: 'Dùng khi thông tin trên giấy tờ hộ tịch (khai sinh, kết hôn...) bị ghi sai và bạn muốn sửa cho đúng. Mang giấy tờ chứng minh thông tin đúng.',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      f('Giấy tờ hộ tịch cần cải chính', 'Ghi tên loại giấy (VD Giấy khai sinh), số, quyển số, ngày cấp – nhìn trực tiếp trên giấy gốc.', 'Giấy khai sinh số 123, quyển 01/2020, cấp ngày 10/01/2020'),
      f('Nội dung đang ghi SAI', 'Chép đúng nguyên văn phần sai đang có trên giấy (VD tên đệm hoặc năm sinh ghi sai).', 'Ghi tên đệm là "VẨN"'),
      f('Nội dung ĐÚNG cần sửa thành', 'Ghi phần đúng và đối chiếu với giấy tờ chứng minh bạn mang theo.', 'Sửa thành "VĂN"'),
      f('Lý do cải chính', 'Nói ngắn gọn nguyên nhân sai: viết nhầm khi đăng ký, đánh máy sai...', 'Sai sót khi đăng ký'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ghi nội dung "đúng" nhưng không có giấy tờ chứng minh đi kèm.',
      ...LOI_CHUNG
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'TRICHLUC_HT', formCode: 'TK-TLHT-01', formName: 'Tờ khai yêu cầu cấp bản sao trích lục hộ tịch',
    shelf: 'Kệ A', tray: 'Khay 2', desk: 'Khu Bàn viết A', docCode: 'TOKHAI_TLHT',
    intro: 'Dùng để xin bản sao giấy tờ hộ tịch đã được đăng ký (khai sinh, kết hôn...). Nhớ được số, quyển, ngày đăng ký thì cán bộ tra cứu nhanh hơn.',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      f('Loại giấy tờ hộ tịch muốn xin bản sao', 'Ghi rõ: khai sinh, kết hôn, khai tử... và họ tên người có tên trong giấy đó.', 'Bản sao Giấy khai sinh của NGUYỄN MINH KHOA'),
      f('Thông tin lần đăng ký trước (nếu nhớ)', 'Ghi số, quyển số, ngày và nơi đăng ký. Không nhớ thì gạch ngang, cán bộ sẽ tra cứu.', 'Số 123, quyển 01/2020, ngày 10/01/2020, UBND phường Dịch Vọng'),
      f('Số bản sao cần cấp', 'Ghi số lượng bản bạn cần (mỗi bản có thể tính lệ phí).', '02 bản'),
      CAM_DOAN_KY
    ],
    mistakes: LOI_CHUNG,
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'SANGTEN', formCode: 'TK-ST-01', formName: 'Tờ khai sang tên Giấy chứng nhận quyền sử dụng đất',
    shelf: 'Kệ B', tray: 'Khay 2', desk: 'Khu Bàn viết B', docCode: 'TOKHAI_ST',
    intro: 'Điền khi chuyển nhượng, tặng cho hoặc nhận thừa kế đất. Bên chuyển và bên nhận cùng chuẩn bị CCCD và Hợp đồng công chứng.',
    fields: [
      KINH_GUI,
      f('Thông tin bên chuyển nhượng (người bán/cho)', 'Họ tên IN HOA, năm sinh, số CCCD, địa chỉ – chép từ CCCD và từ Giấy chứng nhận quyền sử dụng đất.', 'NGUYỄN VĂN AN – CCCD 001090012345'),
      f('Thông tin bên nhận chuyển nhượng (người mua/nhận)', 'Điền tương tự cho người nhận. Cần chính xác vì tên này sẽ ghi vào sổ mới.', 'TRẦN VĂN BẢO – CCCD 001085067890'),
      f('Thông tin thửa đất', 'Chép từ Giấy chứng nhận: số thửa, số tờ bản đồ, diện tích, địa chỉ thửa đất. Sai số thửa là lỗi rất hay gặp.', 'Thửa số 45, tờ bản đồ số 12, 80,5 m², phường Dịch Vọng'),
      f('Giấy chứng nhận đã cấp', 'Ghi số phát hành và số vào sổ cấp giấy (in trên Giấy chứng nhận).', 'Số phát hành CS 123456, số vào sổ CH 00789'),
      f('Hợp đồng/văn bản chuyển nhượng', 'Ghi số công chứng, ngày công chứng và tên Văn phòng công chứng ghi trên hợp đồng.', 'Số công chứng 1234, ngày 10/09/2026, VPCC Hà Nội'),
      f('Đề nghị của bạn', 'Ghi rõ đề nghị "cấp Giấy chứng nhận mới" hoặc "đăng ký biến động" theo hướng dẫn của cán bộ.', 'Đăng ký biến động, cấp Giấy chứng nhận mới'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ghi sai số thửa hoặc số tờ bản đồ so với Giấy chứng nhận.',
      'Thiếu chữ ký của một trong hai bên.',
      ...LOI_CHUNG.slice(0, 2)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'CAPMOI_GCN', formCode: 'TK-DKDD-01', formName: 'Tờ khai đăng ký đất đai',
    shelf: 'Kệ B', tray: 'Khay 1', desk: 'Khu Bàn viết B', docCode: 'TOKHAI_DKDD',
    intro: 'Dùng để đăng ký đất và xin cấp Giấy chứng nhận lần đầu. Mang tất cả giấy tờ nguồn gốc đất bạn có.',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      NOI_CU_TRU,
      f('Thửa đất đăng ký', 'Ghi vị trí thửa đất: số thửa, tờ bản đồ (nếu biết), địa chỉ và diện tích. Chưa biết số thửa thì ghi địa chỉ và hỏi cán bộ.', 'Thôn 3, xã Tân Lập, huyện Đan Phượng, Hà Nội – khoảng 120 m²'),
      f('Mục đích sử dụng đất', 'Ghi loại đất bạn đang dùng: đất ở, đất trồng cây hằng năm, đất vườn...', 'Đất ở tại nông thôn'),
      f('Nguồn gốc và thời điểm sử dụng', 'Đất do ai để lại/được giao/mua từ khi nào, đang dùng ổn định từ năm nào. Ghi đúng và khớp giấy tờ mang theo.', 'Gia đình sử dụng ổn định từ năm 1995'),
      f('Tài sản gắn liền với đất (nhà, cây)', 'Có nhà ở hay công trình trên đất thì ghi rõ loại và diện tích; không có thì gạch ngang.', 'Nhà cấp 4, diện tích 60 m²'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ghi nguồn gốc đất không khớp với giấy tờ đính kèm.',
      ...LOI_CHUNG
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'TACHTHUA', formCode: 'TK-TT-01', formName: 'Tờ khai tách thửa đất',
    shelf: 'Kệ B', tray: 'Khay 3', desk: 'Khu Bàn viết B', docCode: 'TOKHAI_TT',
    intro: 'Dùng khi muốn chia một thửa đất thành nhiều thửa nhỏ. Cần Sơ đồ tách thửa và Giấy chứng nhận bản chính.',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      f('Thửa đất hiện tại', 'Chép từ Giấy chứng nhận: số thửa, số tờ bản đồ, diện tích, địa chỉ.', 'Thửa 45, tờ 12, 200 m², phường Dịch Vọng'),
      f('Số thửa mới và diện tích từng thửa', 'Ghi số lượng thửa muốn tách và diện tích từng thửa, cộng lại phải bằng diện tích cũ. Chép khớp Sơ đồ tách thửa.', 'Tách 2 thửa: 120 m² và 80 m²'),
      f('Lý do tách thửa', 'Ghi ngắn gọn: chia cho con, chuyển nhượng một phần...', 'Chia đất cho con'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Tổng diện tích các thửa mới không bằng diện tích thửa cũ.',
      ...LOI_CHUNG.slice(1)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'CHUYENMDSDD', formCode: 'TK-CMD-01', formName: 'Tờ khai chuyển mục đích sử dụng đất',
    shelf: 'Kệ B', tray: 'Khay 4', desk: 'Khu Bàn viết B', docCode: 'TOKHAI_CMD',
    intro: 'Dùng khi muốn đổi loại đất (VD từ đất vườn sang đất ở). Có thể phải nộp thêm tiền sử dụng đất – cán bộ sẽ báo.',
    fields: [
      KINH_GUI,
      NGUOI_KHAI,
      GIAY_TO_TUY_THAN,
      f('Thửa đất xin chuyển mục đích', 'Chép từ Giấy chứng nhận: số thửa, tờ bản đồ, diện tích, địa chỉ.', 'Thửa 45, tờ 12, 100 m²'),
      f('Mục đích hiện tại', 'Loại đất ghi trên Giấy chứng nhận hiện nay.', 'Đất trồng cây lâu năm'),
      f('Mục đích muốn chuyển sang', 'Ghi loại đất bạn muốn đổi thành. Chọn đúng vì ảnh hưởng đến mức thu.', 'Đất ở tại nông thôn'),
      f('Lý do và cam kết nghĩa vụ tài chính', 'Nêu lý do (xây nhà ở...) và tích ô cam kết nộp đầy đủ nghĩa vụ tài chính nếu có.', 'Xây nhà ở cho gia đình'),
      CAM_DOAN_KY
    ],
    mistakes: LOI_CHUNG,
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'DKKD_HKD', formCode: 'TK-HKD-01', formName: 'Tờ khai đăng ký hộ kinh doanh',
    shelf: 'Kệ C', tray: 'Khay 1', desk: 'Khu Bàn viết C', docCode: 'TOKHAI_HKD',
    intro: 'Dùng để đăng ký hộ kinh doanh cá thể. Hãy nghĩ trước tên hộ kinh doanh và ngành nghề để điền cho nhanh.',
    fields: [
      KINH_GUI,
      f('Tên hộ kinh doanh', 'Đặt tên rõ ràng, không trùng hoặc gây nhầm lẫn với hộ khác trong cùng địa bàn. Có thể hỏi cán bộ để kiểm tra trùng tên.', 'Tạp hóa Bình An'),
      f('Địa chỉ địa điểm kinh doanh', 'Ghi đầy đủ số nhà, đường/thôn, phường/xã, quận/huyện, tỉnh/thành – nơi bạn thật sự bán hàng.', 'Số 12 phố Trần Đăng Ninh, phường Dịch Vọng, Cầu Giấy, Hà Nội'),
      f('Ngành, nghề kinh doanh', 'Ghi rõ hoạt động bạn thực hiện, dùng cụm từ mô tả cụ thể.', 'Bán lẻ hàng tạp hóa'),
      f('Vốn kinh doanh (ước tính)', 'Ghi số tiền bằng số (đồng), ước tính vốn bạn bỏ ra ban đầu.', '50.000.000 đồng'),
      f('Số lao động dự kiến (nếu có)', 'Số người làm cho hộ kinh doanh, không có thì ghi 0 hoặc gạch ngang.', '2'),
      f('Thông tin chủ hộ', 'Họ tên IN HOA, ngày sinh, số CCCD, nơi cư trú – chép từ CCCD.', 'NGUYỄN VĂN AN – 001090012345'),
      SO_DIEN_THOAI,
      CAM_DOAN_KY
    ],
    mistakes: [
      'Tên hộ kinh doanh trùng hoặc gần giống hộ đã đăng ký.',
      'Địa chỉ kinh doanh ghi thiếu (thiếu số nhà hoặc phường/xã).',
      ...LOI_CHUNG.slice(2)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'THAYDOI_DKKD', formCode: 'TK-TDDKKD-01', formName: 'Tờ khai thay đổi nội dung đăng ký kinh doanh',
    shelf: 'Kệ C', tray: 'Khay 2', desk: 'Khu Bàn viết C', docCode: 'TOKHAI_TDDKKD',
    intro: 'Dùng khi hộ kinh doanh đổi tên, địa chỉ, ngành nghề hoặc chủ hộ. Mang Giấy chứng nhận đăng ký kinh doanh cũ.',
    fields: [
      KINH_GUI,
      f('Thông tin hộ kinh doanh hiện tại', 'Ghi tên hộ và số đăng ký đúng như Giấy chứng nhận cũ.', 'Tạp hóa Bình An – số ĐKKD 01A-123456'),
      f('Nội dung thay đổi', 'Ghi rõ mục thay đổi: tên, địa chỉ, ngành nghề, vốn... Chỉ ghi những mục THẬT SỰ đổi.', 'Đổi địa chỉ kinh doanh'),
      f('Thông tin CŨ và MỚI', 'Ghi thông tin cũ (đang có trên Giấy chứng nhận) rồi thông tin mới bạn muốn đổi thành.', 'Cũ: số 12 Trần Đăng Ninh. Mới: số 20 Xuân Thủy'),
      f('Thông tin chủ hộ', 'Họ tên IN HOA, số CCCD, nơi cư trú như CCCD.', 'NGUYỄN VĂN AN – 001090012345'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Ghi thông tin cũ không khớp với Giấy chứng nhận đang giữ.',
      ...LOI_CHUNG.slice(1)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'TAMNGUNG_KD', formCode: 'TK-TN-01', formName: 'Thông báo tạm ngừng kinh doanh',
    shelf: 'Kệ C', tray: 'Khay 3', desk: 'Khu Bàn viết C', docCode: 'TBTAMNGUNG',
    intro: 'Dùng để báo với cơ quan đăng ký khi hộ kinh doanh tạm nghỉ một thời gian. Nên nộp trước ngày bắt đầu tạm ngừng.',
    fields: [
      KINH_GUI,
      f('Tên và số đăng ký hộ kinh doanh', 'Chép đúng theo Giấy chứng nhận đăng ký.', 'Tạp hóa Bình An – 01A-123456'),
      f('Thời gian tạm ngừng', 'Ghi rõ từ ngày… đến ngày… (theo dương lịch). Không được để mở.', 'Từ 01/10/2026 đến 31/03/2027'),
      f('Lý do tạm ngừng', 'Ghi ngắn gọn: sửa chữa cửa hàng, chuyển địa điểm, khó khăn tài chính...', 'Sửa chữa cửa hàng'),
      f('Nghĩa vụ thuế/hóa đơn còn tồn (nếu có)', 'Nếu chưa nộp xong thuế hoặc còn hóa đơn, hãy hỏi cán bộ trước khi nộp tờ này.', 'Không có'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Không ghi rõ ngày bắt đầu và ngày kết thúc tạm ngừng.',
      ...LOI_CHUNG.slice(1)
    ],
    after: SAU_KHI_DIEN
  },
  {
    serviceCode: 'GIAITHE_HKD', formCode: 'TK-GT-01', formName: 'Tờ khai giải thể hộ kinh doanh',
    shelf: 'Kệ C', tray: 'Khay 4', desk: 'Khu Bàn viết C', docCode: 'TOKHAI_GT',
    intro: 'Dùng khi chấm dứt hẳn hoạt động hộ kinh doanh. Hãy chắc chắn đã hoàn thành các nghĩa vụ thuế trước khi nộp.',
    fields: [
      KINH_GUI,
      f('Tên và số đăng ký hộ kinh doanh', 'Chép đúng theo Giấy chứng nhận đăng ký (bản chính bạn mang theo).', 'Tạp hóa Bình An – 01A-123456'),
      f('Thông tin chủ hộ', 'Họ tên IN HOA, số CCCD, nơi cư trú như CCCD.', 'NGUYỄN VĂN AN – 001090012345'),
      f('Lý do giải thể', 'Ghi ngắn gọn lý do dừng hẳn kinh doanh.', 'Không tiếp tục kinh doanh'),
      f('Cam kết đã hoàn thành nghĩa vụ', 'Tích ô/ghi cam kết đã nộp đủ thuế, trả hết khoản nợ và xử lý xong lao động (nếu có). Không chắc thì hỏi cán bộ.', 'Đã hoàn thành đầy đủ nghĩa vụ'),
      CAM_DOAN_KY
    ],
    mistakes: [
      'Cam kết đã xong nghĩa vụ thuế nhưng thực tế chưa nộp.',
      ...LOI_CHUNG.slice(1)
    ],
    after: SAU_KHI_DIEN
  }
];

module.exports = { GENERAL_RULES, DOC_HINTS, FORM_GUIDES };
