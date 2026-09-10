// Chen luot uu tien (VIP Injection) va san tai cuong buc (Force Re-balance) - deu la thao tac
// Admin chu dong kich hoat, khong nam trong vong doi tu dong cua 1 ve (xem ticketLifecycle.js)
// nen tach rieng duoc, khong phu thuoc noShowTimers/callNext/handleNoShow.
const db = require('../../config/db');
const ticketRepo = require('../../repositories/ticketRepository');
const counterRepo = require('../../repositories/counterRepository');
const serviceRepo = require('../../repositories/serviceRepository');
const auditRepo = require('../../repositories/auditRepository');
const wsHub = require('../../websocket/wsHub');

// -----------------------------------------------------------------------------------
// Priority / VIP Queue Injection: chen vao Active Slot + 1, bat buoc ly do + Audit Log.
// -----------------------------------------------------------------------------------
async function priorityInject({ serviceId, citizenName, phone, priorityReasonCode, counterId, adminId }) {
  if (!priorityReasonCode) throw new Error('Bat buoc chon ly do uu tien hop le tu danh muc cung.');
  // Admin Control Tower khong con thu thap Ho ten/SDT cong dan khi cap ve uu tien (chi dinh
  // danh bang So thu tu + Quay) - dung ten an danh, khong lam gian doan luong cap STT.
  const safeCitizenName = (citizenName && String(citizenName).trim()) || 'Công dân ưu tiên';

  const result = await db.withTransaction(async (client) => {
    const service = await serviceRepo.findServiceById(client, serviceId);
    if (!service) throw new Error('Thu tuc khong ton tai.');

    const reasonRow = await client.query('SELECT * FROM priority_reasons WHERE code = ?', [priorityReasonCode]);
    if (!reasonRow.rows[0]) throw new Error('Ly do uu tien khong hop le (phai chon tu danh muc cung).');
    const reason = reasonRow.rows[0];

    let counter;
    if (counterId) {
      counter = await counterRepo.lockById(client, counterId);
      if (!counter || counter.status !== 'OPEN') throw new Error('Quay chi dinh khong hop le hoac khong dang Hoat dong.');
    } else {
      counter = await counterRepo.findLeastLoadedByField(client, service.field_id);
      if (!counter) throw new Error('Khong co quay nao dang mo cho linh vuc nay.');
    }

    const countToday = await ticketRepo.countTodayByField(client, service.field_id);
    const ticketNumber = `${service.ticket_prefix}-${100 + countToday + 1}`;

    const minPos = await client.query(
      `SELECT COALESCE(MIN(queue_position), 1) AS min_pos FROM tickets WHERE counter_id = ? AND status = 'QUEUED'`,
      [counter.id]
    );
    const priorityPosition = Number(minPos.rows[0].min_pos) - 1; // Active Slot + 1

    const ticket = await ticketRepo.insertTicket(client, {
      ticketNumber, serviceId, counterId: counter.id, citizenName: safeCitizenName, phone: phone || '',
      isPriority: true, priorityReasonId: reason.id, queuePosition: priorityPosition
    });

    await ticketRepo.insertHistory(client, {
      ticketId: ticket.id, fromStatus: null, toStatus: 'QUEUED', counterId: counter.id, officerId: adminId,
      eventData: { event: 'PRIORITY_INJECT', reason: reason.code }
    });
    // Bat buoc luu vet Audit Log (chong lam quyen chen luot uu tien).
    await auditRepo.insertLog(client, {
      adminId, action: 'PRIORITY_INJECT', targetType: 'TICKET', targetId: ticket.id,
      reason: reason.label, payload: { ticketNumber, counterId: counter.id, priorityReasonCode }
    });

    return { ticket, counter };
  });

  wsHub.broadcast(wsHub.EVENTS.PRIORITY_INJECTED, { ticket: result.ticket, counter: result.counter });
  return result;
}

// -----------------------------------------------------------------------------------
// Force Re-balance / Split Queue: trich X% duoi hang doi sang quay ranh cung linh vuc.
// -----------------------------------------------------------------------------------
async function forceRebalance({ fromCounterId, toCounterId, percent, adminId }) {
  if (percent <= 0 || percent > 100) throw new Error('Ty le san tai phai trong khoang 1-100%.');

  const result = await db.withTransaction(async (client) => {
    const fromCounter = await counterRepo.lockById(client, fromCounterId);
    const toCounter = await counterRepo.lockById(client, toCounterId);
    if (!fromCounter || !toCounter) throw new Error('Quay khong ton tai.');
    if (toCounter.status !== 'OPEN') throw new Error('Quay dich phai dang o trang thai Hoat dong.');
    if (fromCounter.field_id !== toCounter.field_id) {
      throw new Error('Chi cho phep san tai giua cac quay cung nhom linh vuc (canh bao san tai lien quay).');
    }

    const activeCount = await ticketRepo.countActiveForCounter(client, fromCounterId);
    const moveCount = Math.max(1, Math.ceil((activeCount * percent) / 100));
    const tailTickets = await ticketRepo.listTailQueued(client, fromCounterId, moveCount);

    let tailPos = await ticketRepo.maxQueuePositionForCounter(client, toCounterId);
    const moved = [];
    for (const t of tailTickets) {
      tailPos += 1;
      const updated = await ticketRepo.reassignCounter(client, t.id, toCounterId, tailPos);
      await ticketRepo.insertHistory(client, {
        ticketId: t.id, fromStatus: 'QUEUED', toStatus: 'QUEUED', counterId: toCounterId, officerId: adminId,
        eventData: { event: 'FORCE_REBALANCE', fromCounterId, toCounterId }
      });
      moved.push(updated);
      // TODO-tich-hop: gui SMS/Zalo that "Ma quay cua ban da duoc cap nhat sang {toCounter.code}".
    }

    await auditRepo.insertLog(client, {
      adminId, action: 'FORCE_REBALANCE', targetType: 'COUNTER', targetId: fromCounterId,
      reason: `San tai ${percent}% sang ${toCounter.code}`,
      payload: { fromCounterId, toCounterId, percent, movedTicketIds: moved.map((m) => m.id) }
    });

    return { moved, fromCounter, toCounter };
  });

  wsHub.broadcast(wsHub.EVENTS.QUEUE_REBALANCED, {
    fromCounterId, toCounterId, movedCount: result.moved.length,
    movedTickets: result.moved.map((m) => ({ id: m.id, ticket_number: m.ticket_number }))
  });
  return result;
}

module.exports = { priorityInject, forceRebalance };
