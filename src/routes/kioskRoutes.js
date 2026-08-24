const express = require('express');
const { pool } = require('../config/db');
const serviceRepo = require('../repositories/serviceRepository');
const formTemplateRepo = require('../repositories/formTemplateRepository');
const queueEngine = require('../services/queueEngine');
const configService = require('../config/configService');

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

// Checklist giay to bat buoc + vi tri phoi/to khai mau (Pre-validation & Form Resolution)
router.get('/services/:id/checklist', async (req, res) => {
  try {
    const service = await serviceRepo.findServiceById(pool, req.params.id);
    if (!service) return res.status(404).json({ error: 'Thu tuc khong ton tai.' });
    const form = await formTemplateRepo.findByServiceId(pool, service.id);
    res.json({ service, requiredDocs: service.required_docs, formTemplate: form });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Escape ky tu dac biet theo chuan payload QR Wi-Fi (WIFI:T:...;S:...;P:...;;) - SSID/mat khau
// co the chua ; , : \ do Admin tu nhap, neu khong escape se lam sai dinh dang QR.
function escapeWifiField(value) {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

// INTENT 1: Wi-Fi QR 1 cham. SSID/mat khau lay tu system_configs (Admin cap nhat qua tab
// "Cau hinh Tham so" cho dung mang Wi-Fi THAT tai co so - server chay tren Render (cloud)
// nen khong the tu do duoc mang Wi-Fi vat ly cua tru so).
router.get('/wifi-qr', async (req, res) => {
  try {
    const ssid = await configService.get('WIFI_SSID');
    const password = await configService.get('WIFI_PASSWORD');
    res.json({ ssid, password, payload: `WIFI:T:WPA;S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};;` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INTENT 2: Kiem tra dieu kien dinh danh VNeID Muc 2 (stub)
router.post('/dvc/check-vneid', (req, res) => {
  const { vneidLevel } = req.body;
  if (Number(vneidLevel) >= 2) {
    return res.json({
      eligible: true,
      deeplink: 'https://dichvucong.gov.vn/deep-link/nop-ho-so',
      guideSteps: [
        'Buoc 1: Mo ung dung VNeID, chon "Dich vu cong"',
        'Buoc 2: Chon thu tuc va tai len ho so dinh kem',
        'Buoc 3: Xac nhan thong tin va ky so',
        'Buoc 4: Theo doi trang thai xu ly tren ung dung'
      ]
    });
  }
  res.json({ eligible: false, message: 'Chua co VNeID Muc 2. Vui long chuyen sang nop truc tiep tai quay.' });
});

// CHECK GATE: Cong Tien kiem Du lieu. Neu du 100% -> cap STT (Two-way tai Kiosk truoc khi vao hang doi).
router.post('/tickets', async (req, res) => {
  try {
    const { serviceId, citizenName, phone, confirmedDocCodes } = req.body;
    if (!serviceId || !citizenName) return res.status(400).json({ error: 'Thieu thong tin thu tuc/ho ten.' });

    const service = await serviceRepo.findServiceById(pool, serviceId);
    if (!service) return res.status(404).json({ error: 'Thu tuc khong ton tai.' });

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
      FROM counters c
      JOIN service_fields sf ON sf.id = c.field_id
      LEFT JOIN tickets t ON t.counter_id = c.id AND t.status IN ('QUEUED','CALLING','PROCESSING')
      GROUP BY c.id, sf.name ORDER BY c.code ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
