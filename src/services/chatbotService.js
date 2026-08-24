const { GoogleGenAI } = require('@google/genai');
const { pool } = require('../config/db');
const serviceRepo = require('../repositories/serviceRepository');

// gemini-2.5-flash da bi Google ngung ho tro tai khoan moi (loi 404 "no longer available").
// Chuyen sang gemini-3.6-flash theo dung khuyen nghi tra ve tu chinh API cua Google.
const MODEL = 'gemini-3.6-flash';
const MAX_HISTORY_TURNS = 6; // gioi han ngu canh gui len de kiem soat chi phi

// Loi rieng cho truong hop chua cau hinh API key - nem ra som, ro rang, thay vi de SDK
// bao loi mo ho khi goi API.
class ChatbotConfigError extends Error {}

// Client duoc tao lazy (chi khoi tao khi co request dau tien) de khong crash luc boot
// server neu GEMINI_API_KEY chua duoc cau hinh - loi se duoc bao ro rang khi hoi chatbot.
let client = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ChatbotConfigError('Chua cau hinh GEMINI_API_KEY trong file .env.');
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

// Tang 3: RAG rut gon - vi danh muc thu tuc trong he thong nho (vai chuc thu tuc), ghep toan bo
// CSDL tinh (thu tuc + checklist giay to) va CSDL dong (trang thai quay) lam ngu canh "can cu"
// cho AI, thay vi tim kiem ngu nghia phuc tap. Dieu nay triet tieu rui ro AI "tu bia" thu tuc.
async function buildGroundingContext() {
  const services = await serviceRepo.listServices(pool);
  const { rows: counters } = await pool.query(`
    SELECT c.code, c.name, c.status, sf.name AS field_name,
      SUM(CASE WHEN t.status = 'QUEUED' THEN 1 ELSE 0 END) AS waiting_count
    FROM counters c
    JOIN service_fields sf ON sf.id = c.field_id
    LEFT JOIN tickets t ON t.counter_id = c.id AND t.status IN ('QUEUED','CALLING','PROCESSING')
    GROUP BY c.id, sf.name
    ORDER BY c.code ASC
  `);

  const serviceLines = services.map((s) => {
    const docs = (s.required_docs || []).map((d) => d.name).join(', ');
    return `- [${s.field_name}] "${s.name}" (bí danh: ${s.short_alias || s.name}): thời gian xử lý ${s.sla_minutes} phút, lệ phí ${Number(s.fee_amount).toLocaleString('vi-VN')}đ. Giấy tờ cần: ${docs}.`;
  }).join('\n');

  const counterLines = counters.map((c) =>
    `- ${c.code} (${c.field_name}): ${c.status}${c.status === 'OPEN' ? `, đang có ${c.waiting_count} người chờ` : ''}.`
  ).join('\n');

  // Huong dan tinh nang co dinh cua Kiosk (khong doi theo DB) - de AI co du lieu "can cu" that
  // khi cong dan bam nut Thao tac nhanh (Wi-Fi/DVC/Quet ma) va hoi AI huong dan, thay vi AI
  // khong co du lieu gi ve chinh cac tinh nang cua kiosk va phai tu bia hoac tu choi tra loi.
  const kioskGuide = `- Kết nối Wi-Fi: Bấm nút "Kết nối Wi-Fi" ở màn hình chính Kiosk để xem tên mạng (SSID) và mật khẩu Wi-Fi miễn phí của cơ sở, sau đó vào phần cài đặt Wi-Fi trên điện thoại/máy tính và nhập đúng thông tin đó.
- Nộp trực tuyến qua Dịch vụ công (DVC): Bấm nút "Nộp trực tuyến (DVC)", chọn đúng mức định danh điện tử VNeID hiện tại của bạn. Nếu đã có VNeID mức 2, hệ thống sẽ hiện các bước nộp hồ sơ trực tuyến qua Cổng dịch vụ công quốc gia. Nếu chỉ có mức 1, cần nộp trực tiếp tại quầy.
- Quét mã Bổ sung hồ sơ (Re-entry): Dùng khi cán bộ quầy đã yêu cầu bổ sung giấy tờ còn thiếu và cấp cho bạn 1 mã QR Re-entry. Sau khi chuẩn bị đủ giấy tờ, bấm nút "Quét mã Bổ sung hồ sơ" ở màn hình chính, quét hoặc nhập mã đó để được xếp trở lại hàng đợi ưu tiên ngay, không phải lấy số mới từ đầu.`;

  return `DANH MỤC THỦ TỤC HÀNH CHÍNH HIỆN CÓ:\n${serviceLines}\n\nTRẠNG THÁI QUẦY GIAO DỊCH HIỆN TẠI:\n${counterLines}\n\nHƯỚNG DẪN SỬ DỤNG CÁC TÍNH NĂNG TRÊN KIOSK:\n${kioskGuide}`;
}

function buildSystemPrompt(groundingContext) {
  return `Bạn là trợ lý ảo hỗ trợ công dân tại Kiosk của Trung tâm Hành chính công Một cửa Thông minh.

QUY TẮC BẮT BUỘC:
1. CHỈ được trả lời dựa trên dữ liệu trong mục "DỮ LIỆU CĂN CỨ" bên dưới (bao gồm cả phần danh mục thủ tục, trạng thái quầy, VÀ phần hướng dẫn sử dụng tính năng Kiosk). Nếu câu hỏi về một thủ tục không có trong danh mục, hãy nói rõ là chưa hỗ trợ thủ tục đó tại kiosk này và đề nghị công dân hỏi cán bộ quầy hỗ trợ trực tiếp. TUYỆT ĐỐI không tự bịa tên thủ tục, giấy tờ, lệ phí, hay quy định pháp luật không có trong dữ liệu được cung cấp.
2. TRƯỚC KHI trả lời, đối chiếu kỹ nội dung định trả lời với đúng dòng dữ liệu tương ứng trong "DỮ LIỆU CĂN CỨ" (đúng tên thủ tục, đúng số tiền lệ phí, đúng số phút xử lý, đúng danh sách giấy tờ). Nếu không tìm thấy dữ liệu khớp chính xác hoặc không chắc chắn, PHẢI nói rõ "Tôi chưa có đủ dữ liệu chính xác cho câu hỏi này, vui lòng hỏi trực tiếp cán bộ quầy hỗ trợ" thay vì đoán hoặc suy diễn.
3. Với câu hỏi về MỘT THỦ TỤC HÀNH CHÍNH cụ thể: trả lời ngắn gọn, chia thành các mục: Tên thủ tục, Giấy tờ cần chuẩn bị, Lệ phí, Thời gian xử lý dự kiến. Với câu hỏi về CÁCH SỬ DỤNG TÍNH NĂNG KIOSK (Wi-Fi, DVC, quét mã bổ sung hồ sơ...): trả lời theo đúng nội dung trong mục "HƯỚNG DẪN SỬ DỤNG CÁC TÍNH NĂNG TRÊN KIOSK", văn phong hướng dẫn từng bước ngắn gọn, không cần ép theo khuôn 4 mục trên.
4. Nếu công dân hỏi về tình trạng hàng đợi, dựa vào mục "TRẠNG THÁI QUẦY GIAO DỊCH HIỆN TẠI".
5. Với câu hỏi về một thủ tục hành chính cụ thể, kết thúc câu trả lời bằng phần "Gợi ý tiếp theo" với tối đa 3 gạch đầu dòng theo đúng tinh thần: (1) Xem/tải tờ khai mẫu, (2) Xác nhận đủ giấy tờ để lấy số thứ tự trên Kiosk, (3) Thông tin quầy/lĩnh vực phụ trách. Câu hỏi về cách dùng tính năng Kiosk thì không bắt buộc phần này.
6. Nếu câu hỏi không liên quan tới thủ tục hành chính công hay cách dùng Kiosk tại trung tâm (vd: hỏi chuyện phiếm, yêu cầu ngoài phạm vi), lịch sự từ chối và hướng dẫn quay lại chủ đề.
7. Dùng tiếng Việt có dấu đầy đủ, văn phong lịch sự, thân thiện, phù hợp người dân mọi lứa tuổi. KHÔNG được bỏ dấu tiếng Việt trong bất kỳ phần nào của câu trả lời, kể cả các tiêu đề mục.
8. TUYỆT ĐỐI không dùng ký hiệu markdown (như *, **, #, dấu gạch chéo trang trí) để in đậm hay liệt kê. Viết tên mục thuần văn bản kèm dấu hai chấm (vd: "Tên thủ tục:"), mỗi mục xuống dòng riêng. Khi liệt kê nhiều ý, dùng dấu gạch ngang "-" ở đầu dòng, mỗi ý một dòng, không dùng dấu hoa thị "*".
9. TUYỆT ĐỐI không hiển thị quá trình suy nghĩ, tự kiểm tra, hay bình luận nội bộ (VD: "(Check: ...)", "Let me think...", "Đang phân tích câu hỏi..."). Chỉ xuất ra câu trả lời cuối cùng, sạch sẽ, đi thẳng vào nội dung ngay từ ký tự đầu tiên.

DỮ LIỆU CĂN CỨ (cập nhật thời gian thực từ hệ thống):
${groundingContext}`;
}

async function askAssistant(userMessage, history = []) {
  const trimmedMessage = String(userMessage || '').trim().slice(0, 800);
  if (!trimmedMessage) throw new Error('Vui long nhap noi dung cau hoi.');

  const groundingContext = await buildGroundingContext();
  const systemInstruction = buildSystemPrompt(groundingContext);

  // Chi giu N luot gan nhat de kiem soat chi phi token. Gemini dung role 'model' cho AI
  // (khac Anthropic dung 'assistant') nen can chuyen doi lich su hoi thoai truoc khi goi.
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.slice(0, 800) }]
    }));

  const contents = [...safeHistory, { role: 'user', parts: [{ text: trimmedMessage }] }];

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction,
      maxOutputTokens: 1024,
      // Nhiet do thap de model bam sat DU LIEU CAN CU thay vi "sang tao"/suy dien - giam rui
      // ro hallucination (tra loi sai lech du lieu he thong) cho 1 chatbot FAQ can chinh xac.
      temperature: 0.2
      // Luu y: KHONG dung thinkingConfig o day - gemini-3.6-flash tra ve loi 400
      // "Request contains an invalid argument" khi truyen thinkingConfig.thinkingBudget (co the
      // model nay chua/khong ho tro tham so nay qua @google/genai). Xu ly viec lo "thinking" ra
      // cau tra loi chi bang prompt (quy tac 9 o tren) + loc phan thought=true ben duoi.
    }
  });

  const text = extractFinalAnswerText(response);
  return text || 'Xin loi, hien tai tro ly chua the tra loi. Vui long thu lai.';
}

// Loc bo moi phan duoc model danh dau thought=true (qua trinh suy luan noi bo) truoc khi
// ghep thanh cau tra loi cuoi cung hien thi cho nguoi dung.
function extractFinalAnswerText(response) {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return response.text || '';
  return parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
}

module.exports = { askAssistant, ChatbotConfigError };
