const express = require('express');
const { pool } = require('../config/db');
const counterRepo = require('../repositories/counterRepository');
const ticketRepo = require('../repositories/ticketRepository');
const queueEngine = require('../services/queueEngine');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requirePermission('COUNTER_OPS'));

// Can bo Tiep nhan chi duoc thao tac tren quay minh phu trach (RBAC: "Chi xem quay minh").
async function assertOwnCounterOrAdmin(req, res, next) {
  if (req.staff.role === 'SUPER_ADMIN') return next();
  const counterId = Number(req.params.counterId || req.body.counterId);
  const counter = await counterRepo.findById(pool, counterId);
  if (!counter) return res.status(404).json({ error: 'Quay khong ton tai.' });
  if (counter.officer_id !== req.staff.staffId) {
    return res.status(403).json({ error: 'Ban khong duoc phan cong phu trach quay nay.' });
  }
  next();
}

router.get('/counters', async (req, res) => {
  const rows = await counterRepo.listAll(pool);
  res.json(rows);
});

router.get('/counters/:counterId/queue', assertOwnCounterOrAdmin, async (req, res) => {
  const rows = await ticketRepo.listQueueForCounter(pool, req.params.counterId);
  res.json(rows);
});

router.post('/counters/:counterId/call-next', assertOwnCounterOrAdmin, async (req, res) => {
  try {
    const result = await queueEngine.callNext(Number(req.params.counterId), req.staff.staffId);
    res.json(result || { message: 'Hang doi trong.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:ticketId/accept', async (req, res) => {
  try {
    const ticket = await queueEngine.acceptTicket(req.params.ticketId, req.staff.staffId);
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:ticketId/no-show', async (req, res) => {
  try {
    const result = await queueEngine.manualNoShow(req.params.ticketId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:ticketId/complete', async (req, res) => {
  try {
    const result = await queueEngine.completeTicket(req.params.ticketId, req.staff.staffId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:ticketId/undo', async (req, res) => {
  try {
    const result = await queueEngine.undoComplete(req.params.ticketId, req.staff.staffId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:ticketId/supplement', async (req, res) => {
  try {
    const { missingDocCodes } = req.body;
    const result = await queueEngine.requestSupplement(req.params.ticketId, missingDocCodes, req.staff.staffId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
