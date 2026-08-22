const { withTransaction } = require('../config/db');
const counterRepo = require('../repositories/counterRepository');
const staffRepo = require('../repositories/staffRepository');
const ticketRepo = require('../repositories/ticketRepository');
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

// Xoa quay (soft-delete, xem counterRepository.softDelete): chi chan khi dang xu ly ve
// (CALLING/PROCESSING) - truong hop nay can bo phai Hoan tat/Tam dung truoc vi khong the
// di chuyen an toan 1 giao dich dang do dang. Neu quay con ve dang QUEUED, tu dong chuyen
// toan bo sang quay OPEN khac CUNG LINH VUC theo dung thuat toan Least Queue Depth ma he
// thong dung khi cap ve moi (xem counterRepo.findLeastLoadedByField) - dam bao hanh vi nhat
// quan voi cac quay khac thay vi mot luat rieng cho truong hop xoa.
async function deleteCounter(counterId, adminId, reason) {
  const outcome = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    if (counter.active_ticket_id) {
      throw new Error('Khong the xoa quay dang xu ly ve. Vui long Hoan tat/Tam dung truoc.');
    }

    const queue = (await ticketRepo.listQueueForCounter(client, counterId)).filter((t) => t.status === 'QUEUED');
    let target = null;
    if (queue.length > 0) {
      target = await counterRepo.findLeastLoadedByField(client, counter.field_id, counterId);
      if (!target) {
        throw new Error(`Khong the xoa: day la quay dang mo duy nhat cua linh vuc nay va con ${queue.length} ve dang cho. Vui long mo quay khac cung linh vuc truoc, hoac dung "Dong" thay vi xoa.`);
      }

      let tailPos = await ticketRepo.maxQueuePositionForCounter(client, target.id);
      for (const t of queue) {
        tailPos += 1;
        await ticketRepo.reassignCounter(client, t.id, target.id, tailPos);
        await ticketRepo.insertHistory(client, {
          ticketId: t.id, fromStatus: 'QUEUED', toStatus: 'QUEUED', counterId: target.id, officerId: adminId,
          eventData: { event: 'COUNTER_DELETED_REASSIGN', fromCounterId: counterId, toCounterId: target.id }
        });
      }
    }

    const archivedCode = `${counter.code}-DEL-${Date.now()}`;
    await counterRepo.softDelete(client, counterId, archivedCode);

    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_DELETED', targetType: 'COUNTER', targetId: counterId,
      reason: reason || 'Xoa quay',
      payload: { code: counter.code, name: counter.name, movedTicketCount: queue.length, movedToCounterId: target ? target.id : null }
    });

    return { movedCount: queue.length, targetCounterId: target ? target.id : null };
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counterId, deleted: true, ...outcome });
  if (outcome.targetCounterId) {
    wsHub.broadcast(wsHub.EVENTS.QUEUE_REBALANCED, { fromCounterId: counterId, toCounterId: outcome.targetCounterId, movedCount: outcome.movedCount });
  }
  return outcome;
}

// Gan/Go can bo phu trach quay (officerId = null de go). Day la dieu can thiet de tai
// khoan Officer tao o tab Quan ly Tai khoan thuc su dang nhap va thao tac duoc mot quay
// (assertOwnCounterOrAdmin trong counterRoutes.js doi chieu counter.officer_id voi staffId).
async function assignOfficer(counterId, officerId, adminId, reason) {
  const result = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');

    let officer = null;
    if (officerId) {
      officer = await staffRepo.findById(client, officerId);
      if (!officer) throw new Error('Can bo khong ton tai.');
      if (officer.role !== 'OFFICER') throw new Error('Chi co the gan tai khoan vai tro Officer vao quay.');
      if (!officer.is_active) throw new Error('Tai khoan Officer nay dang bi khoa.');
      await counterRepo.clearOfficerFromOtherCounters(client, officerId, counterId);
    }

    const updated = await counterRepo.updateOfficer(client, counterId, officerId || null);
    await auditRepo.insertLog(client, {
      adminId, action: 'COUNTER_OFFICER_ASSIGNED', targetType: 'COUNTER', targetId: counterId,
      reason: reason || (officerId ? 'Gan can bo phu trach quay' : 'Go can bo phu trach quay'),
      payload: { from: counter.officer_id, to: officerId || null }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.COUNTER_STATUS_CHANGED, { counter: result });
  return result;
}

module.exports = {
  setCounterStatus, changeCounterField, createCounter, updateCounterDetails, deleteCounter, assignOfficer
};
