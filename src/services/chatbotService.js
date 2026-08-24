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

  return `DANH MỤC THỦ TỤC HÀNH CHÍNH HIỆN CÓ:\n${serviceLines}\n\nTRẠNG THÁI QUẦY GIAO DỊCH HIỆN TẠI:\n${counterLines}`;
}

function buildSystemPrompt(groundingContext) {
  return `Bạn là trợ lý ảo hỗ trợ công dân tại Kiosk của Trung tâm Hành chính công Một cửa Thông minh.

QUY TẮC BẮT BUỘC:
1. CHỈ được trả lời dựa trên dữ liệu trong mục "DỮ LIỆU CĂN CỨ" bên dưới. Nếu câu hỏi về một thủ tục không có trong danh mục, hãy nói rõ là chưa hỗ trợ thủ tục đó tại kiosk này và đề nghị công dân hỏi cán bộ quầy hỗ trợ trực tiếp. TUYỆT ĐỐI không tự bịa tên thủ tục, giấy tờ, hay quy định pháp luật không có trong dữ liệu được cung cấp.
2. Trả lời ngắn gọn, rõ ràng, chia thành các mục: Tên thủ tục, Giấy tờ cần chuẩn bị, Lệ phí, Thời gian xử lý dự kiến.
3. Nếu công dân hỏi về tình trạng hàng đợi, dựa vào mục "TRẠNG THÁI QUẦY GIAO DỊCH HIỆN TẠI".
4. Luôn kết thúc câu trả lời bằng phần "Gợi ý tiếp theo" với tối đa 3 gạch đầu dòng theo đúng tinh thần: (1) Xem/tải tờ khai mẫu, (2) Xác nhận đủ giấy tờ để lấy số thứ tự trên Kiosk, (3) Thông tin quầy/lĩnh vực phụ trách.
5. Nếu câu hỏi không liên quan tới thủ tục hành chính công tại trung tâm (vd: hỏi chuyện phiếm, yêu cầu ngoài phạm vi), lịch sự từ chối và hướng dẫn quay lại chủ đề.
6. Dùng tiếng Việt có dấu đầy đủ, văn phong lịch sự, thân thiện, phù hợp người dân mọi lứa tuổi. KHÔNG được bỏ dấu tiếng Việt trong bất kỳ phần nào của câu trả lời, kể cả các tiêu đề mục.
7. TUYỆT ĐỐI không dùng ký hiệu markdown (như *, **, #, dấu gạch chéo trang trí) để in đậm hay liệt kê. Viết tên mục thuần văn bản kèm dấu hai chấm (vd: "Tên thủ tục:"), mỗi mục xuống dòng riêng. Khi liệt kê nhiều ý, dùng dấu gạch ngang "-" ở đầu dòng, mỗi ý một dòng, không dùng dấu hoa thị "*".

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
    config: { systemInstruction, maxOutputTokens: 1024 }
  });

  return response.text || 'Xin loi, hien tai tro ly chua the tra loi. Vui long thu lai.';
}

module.exports = { askAssistant, ChatbotConfigError };
