const express = require('express');
const { pool } = require('../config/db');
const serviceRepo = require('../repositories/serviceRepository');
const formTemplateRepo = require('../repositories/formTemplateRepository');
const queueEngine = require('../services/queueEngine');
const configService = require('../config/configService');
const ticketRepo = require('../repositories/ticketRepository');
const { toPublicTracking } = require('../services/ticketTracking');
const { GENERAL_RULES, DOC_HINTS } = require('../data/formGuides');
const kioskHours = require('../services/kioskHours');
const { buildWifiPayload } = require('../utils/wifiQr');
const wifiGuide = require('../data/wifiGuide');
const dvcGuide = require('../data/dvcGuide');
const { requireInt } = require('../utils/validate');

const router = express.Router();

// INTENT: tra cuu / liet ke thu tuc hanh chinh (dong vai tro RAG rut gon: tim theo tu khoa)
router.get('/services', async (req, res) => {
  try {
    const keyword = req.query.q;
    const rows = keyword ? await serviceRepo.searchServices(pool, keyword) : await serviceRepo.listServices(pool);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bo noi dung huong dan dien (fill_guide, dai) ra khoi phan thong tin to khai gui kem checklist -
// chi trang huong dan dien mau moi can, lay rieng qua /services/:id/form-guide.
function withoutGuide(form) {
  if (!form) return null;
  const { fill_guide: _omit, ...rest } = form;
  return rest;
}

// Checklist giay to bat buoc + vi tri phoi/to khai mau (Pre-validation & Form Resolution).
// Moi giay to kem goi y "cach co/can mang gi" (hint) va co danh dau giay nao la to khai co
// huong dan dien chi tiet (hasFillGuide) de Kiosk hien nut "Xem cach dien".
router.get('/services/:id/checklist', async (req, res) => {
  try {
    const service = await serviceRepo.findServiceById(pool, req.params.id);
    if (!service) return res.status(404).json({ error: 'Thu tuc khong ton tai.' });
    const form = await formTemplateRepo.findByServiceId(pool, service.id);
    const guideDocCode = form && form.fill_guide ? form.fill_guide.docCode : null;
    const requiredDocs = (service.required_docs || []).map((d) => ({
      ...d,
      hint: DOC_HINTS[d.code] || null,
      hasFillGuide: !!guideDocCode && d.code === guideDocCode
    }));
    res.json({ service, requiredDocs, formTemplate: withoutGuide(form), hasFillGuide: !!(form && form.fill_guide) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Danh sach cac to khai co huong dan dien (de nguoi dan chon khi vao trang huong dan dien mau
// ma chua chon thu tuc nao) + quy tac chung khi dien moi loai giay to.
router.get('/form-guides', async (req, res) => {
  try {
    res.json({ generalRules: GENERAL_RULES, forms: await formTemplateRepo.listWithGuide(pool) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Huong dan dien tung o cua to khai cua 1 thu tuc + noi lay phoi + goi y cac giay to di kem.
router.get('/services/:id/form-guide', async (req, res) => {
  try {
    const service = await serviceRepo.findServiceById(pool, req.params.id);
    if (!service) return res.status(404).json({ error: 'Thu tuc khong ton tai.' });
    const form = await formTemplateRepo.findByServiceId(pool, service.id);
    if (!form || !form.fill_guide) {
      return res.status(404).json({ error: 'Thu tuc nay chua co huong dan dien to khai. Vui long hoi can bo ho tro.' });
    }
    const docHints = (service.required_docs || [])
      .filter((d) => DOC_HINTS[d.code])
      .map((d) => ({ code: d.code, name: d.name, hint: DOC_HINTS[d.code] }));
    res.json({
      service: { id: service.id, name: service.name, fee_amount: service.fee_amount, sla_minutes: service.sla_minutes },
      form: withoutGuide(form),
      guide: form.fill_guide,
      generalRules: GENERAL_RULES,
      docHints
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doc Wi-Fi Admin cau hinh (Cau hinh Tham so). Day la thong tin DU PHONG: tren may Kiosk that,
// chatbot/trang Wi-Fi uu tien hoi Dich vu Wi-Fi cuc bo (wifi-local-service, doc mang THAT may dang
// ket noi); khi dich vu do khong chay (hoac nguoi dan mo bang dien thoai rieng) thi dung du lieu nay.
// Kieu bao mat (WPA/WEP/nopass) cung lay tu cau hinh WIFI_SECURITY. Chua co WIFI_SECURITY (CSDL cu)
// -> mac dinh WPA.
async function readConfiguredWifi() {
  const ssid = await configService.get('WIFI_SSID');
  const password = await configService.get('WIFI_PASSWORD');
  let security = 'WPA';
  try { security = await configService.get('WIFI_SECURITY'); } catch (e) { /* CSDL cu chua co khoa nay */ }
  return { ssid, password, security, payload: buildWifiPayload({ ssid, password, security }) };
}

// INTENT 1: Wi-Fi QR 1 cham (du lieu cau hinh - xem readConfiguredWifi).
router.get('/wifi-qr', async (req, res) => {
  try {
    res.json(await readConfiguredWifi());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Huong dan ket noi Wi-Fi cho nguoi lon tuoi (Android/iPhone/nhap tay) kem nguon + muc xac thuc.
router.get('/wifi-guide', async (req, res) => {
  try {
    let network = null;
    try { network = await readConfiguredWifi(); } catch (e) { /* chua cau hinh: van tra huong dan */ }
    res.json({ network, guide: wifiGuide.GUIDE, sources: wifiGuide.SOURCES, statusLabels: wifiGuide.STATUS_LABELS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Huong dan nop ho so truc tuyen tren Cong DVC quoc gia, kem nguon (URL) tung muc + muc xac thuc.
router.get('/dvc-guide', (req, res) => {
  res.json(dvcGuide);
});

// INTENT 2: Dieu kien tai khoan VNeID de nop ho so truc tuyen. Noi dung lay tu src/data/dvcGuide.js
// (co nguon URL). Ban cu tra ve "deeplink" tu che va noi dung khong co nguon - da bo.
// Chi co nguon xac nhan MUC 2 cho it nhat 1 thu tuc cu the (S4); muc 1 chua xac thuc duoc nen
// khong khang dinh "khong nop duoc" hay "nop duoc", chi noi that va huong dan buoc tiep theo.
router.post('/dvc/check-vneid', (req, res) => {
  const level = Number(req.body.vneidLevel);
  const common = {
    guideSteps: dvcGuide.CHATBOT_SHORT_STEPS,
    guideUrl: 'nop-ho-so-truc-tuyen.html',
    portalUrl: 'https://dichvucong.gov.vn/',
    sources: ['S1', 'S2', 'S4', 'S5', 'S7'].map((k) => ({ key: k, ...dvcGuide.SOURCES[k] }))
  };
  if (!(level >= 1)) {
    return res.json({
      eligible: false, certainty: 'PARTIAL', ...common,
      message: 'Bạn cần có tài khoản VNeID đã kích hoạt để nộp hồ sơ trực tuyến. Tài khoản mức 1 tự đăng ký trên ứng dụng VNeID; mức 2 làm trực tiếp tại cơ quan Công an (mang thẻ căn cước, không quá 3 ngày làm việc nếu căn cước còn hiệu lực). Trong lúc chờ, bạn có thể nộp trực tiếp tại quầy.'
    });
  }
  if (level >= 2) {
    return res.json({
      eligible: true, certainty: 'PARTIAL', ...common,
      message: 'Tài khoản mức 2 phù hợp với các hướng dẫn nộp hồ sơ trực tuyến đã đối chiếu. Mỗi thủ tục có thể có yêu cầu riêng, hãy xem chi tiết trên cổng.'
    });
  }
  res.json({
    eligible: false, certainty: 'UNVERIFIED', ...common,
    message: 'Tôi chưa xác thực được tài khoản mức 1 có nộp được hồ sơ hay không (các nguồn đã đọc không nêu rõ; bài hướng dẫn thủ tục trích lục hộ tịch ghi cần mức 2). '
      + 'Bạn có thể hỏi cán bộ, hoặc nâng lên mức 2 tại cơ quan Công an (mang thẻ căn cước, xử lý không quá 3 ngày làm việc nếu căn cước còn hiệu lực), hoặc nộp trực tiếp tại quầy.'
  });
});

// Ho ten/SDT la TUY CHON (Kiosk khong hoi): STT la dinh danh duy nhat cua ve. Chuoi rong/khong
// hop le -> NULL, cat do dai de khong tran cot VARCHAR.
function optionalText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

// Loi doc cau hinh gio (VD thieu tham so o CSDL cu) KHONG duoc khoa cap so: coi nhu dang mo cua.
async function getHoursStatusSafe() {
  try { return await kioskHours.getStatus(); } catch (err) {
    console.error('[kiosk] Khong doc duoc cau hinh gio mo cua, tam thoi cho phep cap so:', err.message);
    return { open: true };
  }
}

// Trang thai gio mo cua (cong khai) - Trang chu/Kiosk hien banner truoc khi nguoi dan mat cong tich giay to.
router.get('/hours', async (req, res) => {
  const { open, enforced, hoursText, message, opensAt } = await getHoursStatusSafe();
  res.json({ open, enforced: !!enforced, hoursText: hoursText || null, message: message || null, opensAt: opensAt || null });
});

// CHECK GATE: Cong Tien kiem Du lieu. Neu du 100% -> cap STT (Two-way tai Kiosk truoc khi vao hang doi).
router.post('/tickets', async (req, res) => {
  try {
    const { confirmedDocCodes } = req.body;
    const citizenName = optionalText(req.body.citizenName, 150);
    const phone = optionalText(req.body.phone, 20);
    const serviceId = requireInt(req.body.serviceId, 'Ma thu tuc (serviceId)');

    const service = await serviceRepo.findServiceById(pool, serviceId);
    if (!service) return res.status(404).json({ error: 'Thu tuc khong ton tai.' });

    // Ngoai gio lam viec (neu cong tac KIOSK_HOURS_ENFORCED dang bat): khong cap so, tra ve
    // thong bao ro rang kem gio mo cua ke tiep de nguoi dan biet khi nao quay lai.
    const hours = await getHoursStatusSafe();
    if (!hours.open) return res.status(200).json({ status: 'CLOSED', message: hours.message, hoursText: hours.hoursText, opensAt: hours.opensAt });

    const mandatoryCodes = (service.required_docs || []).filter((d) => d.mandatory).map((d) => d.code);
    const provided = new Set(confirmedDocCodes || []);
    const missing = mandatoryCodes.filter((c) => !provided.has(c));

    if (missing.length > 0) {
      const form = await formTemplateRepo.findByServiceId(pool, service.id);
      return res.status(200).json({
        status: 'REJECTED',
        missing,
        message: 'Ho so chua du 100%. Vui long bo sung theo huong dan.',
        formTemplate: form
      });
    }

    const result = await queueEngine.createTicket({ serviceId, citizenName, phone });
    res.status(201).json({ status: 'QUEUED', ...result });
  } catch (err) {
    const status = err.code === 'NO_COUNTER_AVAILABLE' ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Cong dan tu theo doi ve cua minh (khong can dang nhap/ten): id ve la UUID ngau nhien nen dong
// vai tro "chia khoa" - chi ai giu duoc lien ket/QR tren phieu STT moi xem duoc. Khong tra ten/SDT.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/tickets/:id/status', async (req, res) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Khong tim thay ve.' });
    const info = await ticketRepo.getTrackingInfo(pool, req.params.id);
    if (!info) return res.status(404).json({ error: 'Khong tim thay ve.' });
    res.json(toPublicTracking(info));
  } catch (err) {
    res.status(500).json({ error: 'Loi he thong noi bo.' });
  }
});

// Cong dan quet lai ma QR Re-entry sau khi bo sung ho so tai Ban ke khai
router.post('/reentry-scan', async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await queueEngine.reentryScan(token);
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Chi dan quay giao dich: uoc tinh so nguoi cho phia truoc theo linh vuc
router.get('/counters/status', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.code, c.name, c.status, sf.name AS field_name,
        SUM(CASE WHEN t.status = 'QUEUED' THEN 1 ELSE 0 END) AS waiting_count
      FROM active_counters c
      JOIN service_fields sf ON sf.id = c.field_id
      LEFT JOIN tickets t ON t.counter_id = c.id AND t.status IN ('QUEUED','CALLING','PROCESSING')
      GROUP BY c.id, c.code, c.name, c.status, sf.name ORDER BY c.code ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
