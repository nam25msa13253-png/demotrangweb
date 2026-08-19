const { GoogleGenAI } = require('@google/genai');
const { pool } = require('../config/db');
const serviceRepo = require('../repositories/serviceRepository');

const MODEL = 'gemini-2.5-flash';
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
    return `- [${s.field_name}] "${s.name}" (alias: ${s.short_alias || s.name}): SLA ${s.sla_minutes} phut, le phi ${Number(s.fee_amount).toLocaleString('vi-VN')}d. Giay to can: ${docs}.`;
  }).join('\n');

  const counterLines = counters.map((c) =>
    `- ${c.code} (${c.field_name}): ${c.status}${c.status === 'OPEN' ? `, dang co ${c.waiting_count} nguoi cho` : ''}.`
  ).join('\n');

  return `DANH MUC THU TUC HANH CHINH HIEN CO:\n${serviceLines}\n\nTRANG THAI QUAY GIAO DICH HIEN TAI:\n${counterLines}`;
}

function buildSystemPrompt(groundingContext) {
  return `Ban la tro ly ao ho tro cong dan tai Kiosk cua Trung tam Hanh chinh cong Mot cua Thong minh.

QUY TAC BAT BUOC:
1. CHI duoc tra loi dua tren du lieu trong muc "DU LIEU CAN CU" ben duoi. Neu cau hoi ve mot thu tuc khong co trong danh muc, hay noi ro la chua ho tro thu tuc do tai kiosk nay va de nghi cong dan hoi can bo quay ho tro truc tiep. TUYET DOI khong tu bia ten thu tuc, giay to, hay quy dinh phap luat khong co trong du lieu duoc cung cap.
2. Tra loi ngan gon, ro rang, chia thanh cac muc: Ten thu tuc, Giay to can chuan bi, Le phi, Thoi gian xu ly du kien.
3. Neu cong dan hoi ve tinh trang hang doi, dua vao muc "TRANG THAI QUAY GIAO DICH HIEN TAI".
4. Luon ket thuc cau tra loi bang phan "Goi y tiep theo" voi toi da 3 gach dau dong theo dung tinh than: (1) Xem/tai to khai mau, (2) Xac nhan du giay to de lay so thu tu tren Kiosk, (3) Thong tin quay/linh vuc phu trach.
5. Neu cau hoi khong lien quan toi thu tuc hanh chinh cong tai trung tam (vd: hoi chuyen phiem, yeu cau ngoai pham vi), lich su tu choi va huong dan quay lai chu de.
6. Dung tieng Viet, van phong lich su, than thien, phu hop nguoi dan moi lua tuoi.

DU LIEU CAN CU (cap nhat thoi gian thuc tu he thong):
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
