const { withTransaction } = require('../config/db');
const counterRepo = require('../repositories/counterRepository');
const auditRepo = require('../repositories/auditRepository');
const queueEngine = require('./queueEngine');
const wsHub = require('../websocket/wsHub');

// Mo / Dong / Tam dung quay (1 nut chuyen trang thai khi can bo nghi giai lao, hop dot xuat...)
async function setCounterStatus(counterId, status, adminId, reason) {
  if (!['OPEN', 'PAUSED', 'CLOSED'].includes(status)) throw new Error('Trang thai quay khong hop le.');

  const result = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    const updated = await counterRepo.updateStatus(client, counterId, status);
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_STATUS_CHANGE', targetType: 'COUNTER', targetId: counterId,
      reason: reason || `Chuyen trang thai sang ${status}`,
      payload: { from: counter.status, to: status }
    });
    return updated;
  });

  // Neu Admin dong/tam dung quay dang co ve CALLING, huy dem nguoc Timeout dang cho.
  if (status !== 'OPEN' && result.active_ticket_id) {
    queueEngine.clearNoShowTimeout(result.active_ticket_id);
  }

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counter: result });
  return result;
}

// Doi linh vuc chuyen trach cua quay (VD: chuyen Quay 01 tu Ho tich sang ho tro Dat dai).
async function changeCounterField(counterId, newFieldId, adminId, reason) {
  const result = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    if (counter.active_ticket_id) {
      throw new Error('Khong the doi linh vuc khi quay dang xu ly ve. Vui long Hoan tat/Tam dung truoc.');
    }
    const updated = await counterRepo.updateField(client, counterId, newFieldId);
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_FIELD_CHANGE', targetType: 'COUNTER', targetId: counterId,
      reason: reason || 'Doi linh vuc chuyen trach', payload: { from: counter.field_id, to: newFieldId }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counter: result });
  return result;
}

// Them quay moi cho linh vuc bat ky - moi phuong/xa co so luong quay khac nhau.
async function createCounter(code, name, fieldId, adminId) {
  const result = await withTransaction(async (client) => {
    const created = await counterRepo.create(client, { code, name, fieldId });
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_CREATED', targetType: 'COUNTER', targetId: created.id,
      reason: 'Tao quay moi', payload: { code, name, fieldId }
    });
    return created;
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counter: result });
  return result;
}

// Sua ma/ten quay (doi linh vuc van dung endpoint changeCounterField rieng o tren).
async function updateCounterDetails(counterId, code, name, adminId) {
  const result = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    const updated = await counterRepo.updateDetails(client, counterId, { code, name });
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_UPDATED', targetType: 'COUNTER', targetId: counterId,
      reason: 'Cap nhat thong tin quay',
      payload: { from: { code: counter.code, name: counter.name }, to: { code, name } }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counter: result });
  return result;
}

// Xoa quay: chi cho phep khi khong dang xu ly ve. Neu quay da co lich su giao dich (tickets/
// ticket_status_history tham chieu toi), FK RESTRICT se chan xoa de bao toan Audit Trail -
// huong dan Admin dung "Dong" thay vi xoa trong truong hop do.
async function deleteCounter(counterId, adminId, reason) {
  await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    if (counter.active_ticket_id) {
      throw new Error('Khong the xoa quay dang xu ly ve. Vui long Hoan tat/Tam dung truoc.');
    }
    try {
      await counterRepo.remove(client, counterId);
    } catch (err) {
      if (err.code === '23503') { // foreign_key_violation (Postgres SQLSTATE)
        throw new Error('Quay nay da co lich su giao dich, khong the xoa de bao toan Audit Trail. Vui long chuyen trang thai sang "Dong" thay vi xoa.');
      }
      throw err;
    }
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_DELETED', targetType: 'COUNTER', targetId: counterId,
      reason: reason || 'Xoa quay', payload: { code: counter.code, name: counter.name }
    });
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counterId, deleted: true });
}

module.exports = {
  setCounterStatus, changeCounterField, createCounter, updateCounterDetails, deleteCounter
};
