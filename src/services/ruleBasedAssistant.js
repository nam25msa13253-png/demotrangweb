// Bo tra loi Rule-based: khong goi API AI nao, khong gioi han so lan hoi, khong ton phi,
// khong bao gio "bia" thong tin vi chi doc thang tu du lieu that trong DB roi dien vao mau
// cau tra loi co san. Dung cho cac mau cau hoi PHO BIEN (chao hoi, hoi 1 thu tuc cu the, hoi
// tinh trang quay, hoi cach dung tinh nang Kiosk). Neu KHONG nhan dien duoc mau nao, tra ve
// null de chatbotRoutes.js chuyen sang goi Gemini API (co kha nang hieu ngon ngu tu nhien linh
// hoat hon cho cau hoi dien dat phuc tap/vong vo).
const { pool } = require('../config/db');
const serviceRepo = require('../repositories/serviceRepository');
const kioskFeatureGuide = require('./kioskFeatureGuide');

// Vietnamese hay go khong dau/co dau lan lon - bo dau + ha chu thuong de so khop dang tin cay
// hon la yeu cau khop chinh xac tung ky tu.
function unaccentVi(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
function normalize(str) {
  return unaccentVi(String(str || '')).toLowerCase().replace(/\s+/g, ' ').trim();
}

const GREETING_PATTERN = /^(xin chao|chao ban|chao|hi|hello|alo)[\s!.?]*$/;
const COUNTER_KEYWORDS = ['quay nao', 'hang doi', 'cho bao lau', 'may quay', 'quay dang', 'tinh trang quay', 'con cho', 'dang mo quay'];

function formatServiceAnswer(service) {
  const docs = (service.required_docs || []).map((d) => `- ${d.name}`).join('\n');
  return [
    `Tên thủ tục: ${service.name}`,
    `Giấy tờ cần chuẩn bị:`,
    docs,
    `Lệ phí: ${Number(service.fee_amount).toLocaleString('vi-VN')}đ`,
    `Thời gian xử lý dự kiến: ${service.sla_minutes} phút`,
    ``,
    `Gợi ý tiếp theo:`,
    `- Chọn đúng thủ tục này trên màn hình Kiosk để xem/lấy mẫu tờ khai`,
    `- Xác nhận đủ giấy tờ để lấy số thứ tự trên Kiosk`,
    `- Thủ tục thuộc lĩnh vực ${service.field_name}, được xử lý tại các quầy ${service.field_name}`
  ].join('\n');
}

// Tim thu tuc co bi danh/ten XUAT HIEN trong cau hoi (khong phai nguoc lai) - vi cau hoi
// thuong la 1 cau day du chua ten thu tuc o dau do (VD "Lam giay khai sinh can gi?"). Uu tien
// bi danh/ten DAI NHAT khop duoc de tranh nham lan giua cac thu tuc co tu chung (VD "dat").
async function matchService(normalizedMessage) {
  const services = await serviceRepo.listServices(pool);
  let best = null;
  let bestLen = 0;
  for (const s of services) {
    const candidates = [s.short_alias, s.name].filter(Boolean).map(normalize);
    for (const c of candidates) {
      if (c.length >= 4 && normalizedMessage.includes(c) && c.length > bestLen) {
        best = s;
        bestLen = c.length;
      }
    }
  }
  return best;
}

async function matchCounterStatus(normalizedMessage) {
  if (!COUNTER_KEYWORDS.some((k) => normalizedMessage.includes(k))) return null;

  const { rows } = await pool.query(`
    SELECT c.code, c.status, sf.name AS field_name,
      SUM(CASE WHEN t.status = 'QUEUED' THEN 1 ELSE 0 END) AS waiting_count
    FROM counters c
    JOIN service_fields sf ON sf.id = c.field_id
    LEFT JOIN tickets t ON t.counter_id = c.id AND t.status IN ('QUEUED','CALLING','PROCESSING')
    WHERE c.is_deleted = 0
    GROUP BY c.id, sf.name
    ORDER BY c.code ASC
  `);
  if (rows.length === 0) return 'Hiện chưa có dữ liệu quầy nào trong hệ thống.';

  const lines = rows.map((c) => {
    const label = c.status === 'OPEN' ? `đang mở, có ${c.waiting_count} người chờ`
      : c.status === 'PAUSED' ? 'đang tạm dừng' : 'đang đóng';
    return `- ${c.code} (${c.field_name}): ${label}`;
  });
  return `Tình trạng quầy hiện tại:\n${lines.join('\n')}`;
}

function matchKioskFeature(normalizedMessage) {
  for (const f of kioskFeatureGuide.KIOSK_FEATURES) {
    if (f.keywords.some((k) => normalizedMessage.includes(normalize(k)))) return f.text;
  }
  return null;
}

// Tra ve chuoi cau tra loi neu nhan dien duoc mau cau hoi, hoac null neu khong (bao chatbotRoutes
// chuyen sang goi Gemini API).
async function tryAnswer(rawMessage) {
  const message = normalize(rawMessage);
  if (!message) return null;

  if (GREETING_PATTERN.test(message)) {
    return 'Xin chào! Tôi là trợ lý ảo của Trung tâm Hành chính công. Bạn cần hỏi về thủ tục nào? Bạn có thể hỏi tôi về giấy tờ cần chuẩn bị, lệ phí, thời gian xử lý, hoặc tình trạng quầy/hàng đợi hiện tại.';
  }

  const kioskAnswer = matchKioskFeature(message);
  if (kioskAnswer) return kioskAnswer;

  const counterAnswer = await matchCounterStatus(message);
  if (counterAnswer) return counterAnswer;

  const service = await matchService(message);
  if (service) return formatServiceAnswer(service);

  return null;
}

module.exports = { tryAnswer };
