const express = require('express');
const { pool } = require('../config/db');
const counterRepo = require('../repositories/counterRepository');
const ticketRepo = require('../repositories/ticketRepository');
const serviceRepo = require('../repositories/serviceRepository');
const formTemplateRepo = require('../repositories/formTemplateRepository');
const configService = require('../config/configService');
const counterService = require('../services/counterService');
const queueEngine = require('../services/queueEngine');
const analyticsService = require('../services/analyticsService');
const staffService = require('../services/staffService');
const staffRepo = require('../repositories/staffRepository');
const wsHub = require('../websocket/wsHub');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ===================== Phan he 1: Giam sat Realtime (MONITOR) =====================
router.get('/counters', requirePermission('MONITOR'), async (req, res) => {
  res.json(await counterRepo.listAll(pool));
});

router.get('/fields', requirePermission('MONITOR'), async (req, res) => {
  res.json(await serviceRepo.listFields(pool));
});

// Danh sach Officer (rut gon) de gan vao quay - dat o quyen DISPATCH (MANAGER/SUPERVISOR
// cung dieu phoi duoc), khac voi /staff day du chi danh cho STAFF_MANAGEMENT (SUPER_ADMIN).
router.get('/officers', requirePermission('DISPATCH'), async (req, res) => {
  res.json(await staffRepo.listByRole(pool, 'OFFICER'));
});

router.get('/analytics/top-metrics', requirePermission('MONITOR'), async (req, res) => {
  res.json(await analyticsService.getTopMetrics());
});

router.get('/analytics/heatmap', requirePermission('MONITOR'), async (req, res) => {
  res.json(await analyticsService.getHeatmap());
});

// ===================== Phan he 2: Dieu phoi & Can thiep Khan cap (DISPATCH) =====================
router.post('/counters/:id/status', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const outcome = await counterService.setCounterStatus(Number(req.params.id), status, req.staff.staffId, reason);
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/counters/:id/field', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { fieldId, reason } = req.body;
    const counter = await counterService.changeCounterField(Number(req.params.id), Number(fieldId), req.staff.staffId, reason);
    res.json(counter);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Them/Sua/Xoa quay - moi phuong/xa co so luong quay khac nhau nen khong the co dinh nhu seed data mau.
router.post('/counters', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { code, name, fieldId } = req.body;
    if (!code || !name || !fieldId) return res.status(400).json({ error: 'Thieu ma quay, ten quay hoac linh vuc.' });
    const counter = await counterService.createCounter(String(code).trim().toUpperCase(), String(name).trim(), Number(fieldId), req.staff.staffId);
    res.status(201).json(counter);
  } catch (err) {
    const message = (err.code === '23505') ? 'Ma quay da ton tai.' : err.message; // unique_violation (Postgres SQLSTATE)
    res.status(400).json({ error: message });
  }
});

router.put('/counters/:id', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Thieu ma quay hoac ten quay.' });
    const counter = await counterService.updateCounterDetails(Number(req.params.id), String(code).trim().toUpperCase(), String(name).trim(), req.staff.staffId);
    res.json(counter);
  } catch (err) {
    const message = (err.code === '23505') ? 'Ma quay da ton tai.' : err.message; // unique_violation (Postgres SQLSTATE)
    res.status(400).json({ error: message });
  }
});

router.delete('/counters/:id', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const outcome = await counterService.deleteCounter(Number(req.params.id), req.staff.staffId, req.body.reason);
    res.json({ success: true, ...outcome });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/counters/:id/officer', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { officerId, reason } = req.body;
    const counter = await counterService.assignOfficer(Number(req.params.id), officerId || null, req.staff.staffId, reason);
    res.json(counter);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rebalance', requirePermission('DISPATCH'), async (req, res) => {
  try {
    const { fromCounterId, toCounterId, percent } = req.body;
    const result = await queueEngine.forceRebalance({
      fromCounterId: Number(fromCounterId), toCounterId: Number(toCounterId),
      percent: Number(percent), adminId: req.staff.staffId
    });
    res.json({ movedCount: result.moved.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== Phan he 2: Khoi phuc / VIP (PRIORITY_RESTORE) =====================
router.get('/priority-reasons', requirePermission('PRIORITY_RESTORE'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM priority_reasons ORDER BY id ASC');
  res.json(rows);
});

router.post('/priority-inject', requirePermission('PRIORITY_RESTORE'), async (req, res) => {
  try {
    const { serviceId, citizenName, phone, priorityReasonCode, counterId } = req.body;
    const result = await queueEngine.priorityInject({
      serviceId: Number(serviceId), citizenName, phone, priorityReasonCode,
      counterId: counterId ? Number(counterId) : null, adminId: req.staff.staffId
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Danh sach ve (So thu tu + Quay) de chon nhanh tren UI Emergency Skip / Khoi phuc, thay vi
// bat Admin go tay UUID Ticket ID.
router.get('/tickets/actionable', requirePermission('PRIORITY_RESTORE'), async (req, res) => {
  res.json(await ticketRepo.listActionableForAdmin(pool));
});

router.post('/tickets/:id/emergency-skip', requirePermission('PRIORITY_RESTORE'), async (req, res) => {
  try {
    const ticket = await queueEngine.emergencySkip(req.params.id, req.staff.staffId, req.body.reason);
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:id/restore', requirePermission('PRIORITY_RESTORE'), async (req, res) => {
  try {
    const ticket = await queueEngine.restoreCancelledTicket(req.params.id, req.staff.staffId, req.body.reason);
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== Phan he 3: Cau hinh Tham so Dong (CONFIG) =====================
router.get('/configs', requirePermission('CONFIG'), async (req, res) => {
  res.json(await configService.getAll());
});

router.put('/configs/:key', requirePermission('CONFIG'), async (req, res) => {
  try {
    const updated = await configService.set(req.params.key, req.body.value, req.staff.staffId);
    wsHub.broadcast(wsHub.EVENTS.CONFIG_UPDATED, { key: req.params.key, value: updated.config_value });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/form-templates', requirePermission('CONFIG'), async (req, res) => {
  res.json(await formTemplateRepo.listAll(pool));
});

router.put('/form-templates', requirePermission('CONFIG'), async (req, res) => {
  try {
    const saved = await formTemplateRepo.upsert(pool, req.body);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== Phan he 4: Bao cao & Audit (REPORTS) =====================
router.get('/analytics/officer-kpi', requirePermission('REPORTS'), async (req, res) => {
  res.json(await analyticsService.getOfficerKpi());
});

router.get('/analytics/peak-hour', requirePermission('REPORTS'), async (req, res) => {
  res.json(await analyticsService.getPeakHourAnalysis());
});

router.get('/analytics/service-quality', requirePermission('REPORTS'), async (req, res) => {
  res.json(await analyticsService.getServiceQualityByField());
});

router.get('/audit-logs', requirePermission('REPORTS'), async (req, res) => {
  res.json(await analyticsService.getAuditLogs(Number(req.query.limit) || 100));
});

// ===================== Phan he 5: Quan ly Tai khoan Can bo (STAFF_MANAGEMENT) =====================
router.get('/staff', requirePermission('STAFF_MANAGEMENT'), async (req, res) => {
  res.json(await staffService.listStaff());
});

router.post('/staff', requirePermission('STAFF_MANAGEMENT'), async (req, res) => {
  try {
    const { fullName, username, password, role } = req.body;
    const created = await staffService.createStaff({ fullName, username, password, role }, req.staff.staffId);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/staff/:id/active', requirePermission('STAFF_MANAGEMENT'), async (req, res) => {
  try {
    const updated = await staffService.setStaffActive(req.params.id, !!req.body.isActive, req.staff.staffId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/staff/:id/password', requirePermission('STAFF_MANAGEMENT'), async (req, res) => {
  try {
    await staffService.resetStaffPassword(req.params.id, req.body.password, req.staff.staffId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
