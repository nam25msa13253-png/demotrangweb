const crypto = require('crypto');
const { withTransaction } = require('../config/db');
const configService = require('../config/configService');
const ticketRepo = require('../repositories/ticketRepository');
const counterRepo = require('../repositories/counterRepository');
const serviceRepo = require('../repositories/serviceRepository');
const auditRepo = require('../repositories/auditRepository');
const wsHub = require('../websocket/wsHub');

// Bo dinh thoi Call Timeout 45s trong bo nho: ticketId -> Timeout handle.
// Khi timer no ma ve van con o trang thai CALLING => tu dong kich hoat No-Show.
const noShowTimers = new Map();

function scheduleNoShowTimeout(ticketId, seconds) {
  clearNoShowTimeout(ticketId);
  const handle = setTimeout(() => {
    noShowTimers.delete(ticketId);
    handleNoShow(ticketId).catch((err) => console.error('[queueEngine] Loi xu ly No-Show:', err));
  }, seconds * 1000);
  noShowTimers.set(ticketId, handle);
}

function clearNoShowTimeout(ticketId) {
  const handle = noShowTimers.get(ticketId);
  if (handle) {
    clearTimeout(handle);
    noShowTimers.delete(ticketId);
  }
}

function buildAnnouncement(ticket, service, counter) {
  const alias = service.short_alias || service.name;
  return `Mời công dân ${ticket.citizen_name}, số ${ticket.ticket_number}, làm thủ tục ${alias} đến ${counter.name}`;
}

// -----------------------------------------------------------------------------------
// Cap so thu tu (STT): tien to theo linh vuc (VD A-101), gan quay theo Least Queue Depth.
// -----------------------------------------------------------------------------------
async function createTicket({ serviceId, citizenName, phone }) {
  return withTransaction(async (client) => {
    const service = await serviceRepo.findServiceById(client, serviceId);
    if (!service) throw new Error('Thu tuc khong ton tai.');

    const counter = await counterRepo.findLeastLoadedByField(client, service.field_id);
    if (!counter) {
      const err = new Error('Hien tai khong co quay nao dang mo cho linh vuc nay. Vui long quay lai sau.');
      err.code = 'NO_COUNTER_AVAILABLE';
      throw err;
    }

    const countToday = await ticketRepo.countTodayByField(client, service.field_id);
    const ticketNumber = `${service.ticket_prefix}-${100 + countToday + 1}`;
    const tailPosition = (await ticketRepo.maxQueuePositionForCounter(client, counter.id)) + 1;

    const ticket = await ticketRepo.insertTicket(client, {
      ticketNumber, serviceId, counterId: counter.id, citizenName, phone, queuePosition: tailPosition
    });
    await ticketRepo.insertHistory(client, {
      ticketId: ticket.id, fromStatus: null, toStatus: 'QUEUED', counterId: counter.id,
      eventData: { event: 'TICKET_CREATED' }
    });

    wsHub.broadcast(wsHub.EVENTS.TICKET_CREATED, { ticket, counterId: counter.id });
    return { ticket, counter, service };
  });
}

// -----------------------------------------------------------------------------------
// Goi so tiep theo: Keo ve tu Ready Slot -> Active Slot, kich hoat dem nguoc 45s.
// -----------------------------------------------------------------------------------
async function callNext(counterId, officerId) {
  const result = await withTransaction(async (client) => {
    const counter = await counterRepo.lockById(client, counterId);
    if (!counter) throw new Error('Quay khong ton tai.');
    if (counter.status !== 'OPEN') throw new Error('Quay dang khong o trang thai Hoat dong.');
    if (counter.active_ticket_id) throw new Error('Quay dang co ve dang xu ly, khong the goi so moi.');

    const nextTicket = await ticketRepo.findNextQueuedForCounter(client, counterId);
    if (!nextTicket) return null; // Hang doi rong

    const updated = await ticketRepo.updateStatus(client, nextTicket.id, {
      status: 'CALLING', called_at: new Date(), counter_id: counterId
    });
    await counterRepo.setActiveTicket(client, counterId, updated.id);
    await ticketRepo.insertHistory(client, {
      ticketId: updated.id, fromStatus: 'QUEUED', toStatus: 'CALLING', counterId, officerId,
      eventData: { event: 'CALL_NEXT' }
    });

    const service = await serviceRepo.findServiceById(client, updated.service_id);
    return { ticket: updated, counter, service };
  });

  if (!result) {
    wsHub.broadcast(wsHub.EVENTS.CALL_NEXT, { counterId, ticket: null, message: 'Hang doi trong.' });
    return null;
  }

  const timeoutSeconds = await configService.get('CALL_TIMEOUT_SECONDS');
  scheduleNoShowTimeout(result.ticket.id, timeoutSeconds);

  const announcement = buildAnnouncement(result.ticket, result.service, result.counter);
  wsHub.broadcast(wsHub.EVENTS.CALL_NEXT, {
    ticket: result.ticket, counter: result.counter, announcement, timeoutSeconds
  });
  return result;
}

// -----------------------------------------------------------------------------------
// Khach co mat: Can bo bam "Tiep nhan" -> dung dem nguoc, chuyen PROCESSING.
// -----------------------------------------------------------------------------------
async function acceptTicket(ticketId, officerId) {
  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (ticket.status !== 'CALLING') throw new Error('Ve khong o trang thai dang goi (CALLING).');

    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'PROCESSING', processing_at: new Date()
    });
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'CALLING', toStatus: 'PROCESSING', counterId: ticket.counter_id, officerId,
      eventData: { event: 'ACCEPT' }
    });
    return updated;
  });

  clearNoShowTimeout(ticketId);
  wsHub.broadcast(wsHub.EVENTS.TICKET_PROCESSING, { ticket: result });
  return result;
}

// -----------------------------------------------------------------------------------
// Thuat toan Dynamic Head-to-Tail Shift & 3-Strike Drop.
// Kich hoat tu dong khi het 45s (hoac Admin bam thu cong "Vang mat").
// -----------------------------------------------------------------------------------
async function handleNoShow(ticketId) {
  const maxRetry = await configService.get('MAX_RETRY_COUNT');

  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket || ticket.status !== 'CALLING') return null; // da duoc xu ly (vd da Tiep nhan) truoc khi timer no

    const newRetryCount = ticket.retry_count + 1;
    await counterRepo.setActiveTicket(client, ticket.counter_id, null); // giai phong Active Slot

    if (newRetryCount < maxRetry) {
      const tailPos = (await ticketRepo.maxQueuePositionForCounter(client, ticket.counter_id)) + 1;
      const updated = await ticketRepo.updateStatus(client, ticketId, {
        status: 'QUEUED', retry_count: newRetryCount, queue_position: tailPos, called_at: null
      });
      await ticketRepo.insertHistory(client, {
        ticketId, fromStatus: 'CALLING', toStatus: 'QUEUED', counterId: ticket.counter_id,
        eventData: { event: 'NO_SHOW', retry_count: newRetryCount }
      });
      return { outcome: 'REQUEUED', ticket: updated, counterId: ticket.counter_id };
    }

    // 3-Strike Drop: huy ve vinh vien
    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'CANCELLED', retry_count: newRetryCount, cancelled_at: new Date()
    });
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'CALLING', toStatus: 'CANCELLED', counterId: ticket.counter_id,
      eventData: { event: 'NO_SHOW_3_STRIKE_DROP', retry_count: newRetryCount }
    });
    return { outcome: 'CANCELLED', ticket: updated, counterId: ticket.counter_id };
  });

  if (!result) return null;

  if (result.outcome === 'REQUEUED') {
    // TODO-tich-hop: goi Gateway SMS/Zalo that de gui "STT xxx da doi lich, vui long cho goi lai".
    wsHub.broadcast(wsHub.EVENTS.TIMEOUT_NO_SHOW, {
      ticket: result.ticket, counterId: result.counterId, outcome: 'REQUEUED',
      notice: `SMS/Zalo: STT ${result.ticket.ticket_number} vang mat, da doi xuong cuoi hang doi (lan ${result.ticket.retry_count}/${await configService.get('MAX_RETRY_COUNT')}).`
    });
  } else {
    wsHub.broadcast(wsHub.EVENTS.TICKET_CANCELLED, {
      ticket: result.ticket, counterId: result.counterId, outcome: 'CANCELLED_3_STRIKE',
      notice: `SMS/Zalo: STT ${result.ticket.ticket_number} da bi huy do vang mat 3 lan lien tiep.`
    });
  }

  // Tu dong kich hoat goi luot ke tiep (tiep tuc vong lap phuc vu quay)
  await callNext(result.counterId, null).catch((err) => console.error('[queueEngine] auto callNext loi:', err));
  return result;
}

// Cho phep Can bo/Admin chu dong bam "Vang mat" thay vi cho het 45s.
async function manualNoShow(ticketId) {
  clearNoShowTimeout(ticketId);
  return handleNoShow(ticketId);
}

// -----------------------------------------------------------------------------------
// Tham dinh Phan nhanh 2 Luong (Two-way Inspection Branching)
// -----------------------------------------------------------------------------------

// Nhanh Dat 100%: PROCESSING -> COMPLETED. Ho tro Undo Buffer (5s).
async function completeTicket(ticketId, officerId) {
  const undoBufferSeconds = await configService.get('UNDO_BUFFER_SECONDS');

  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (ticket.status !== 'PROCESSING') throw new Error('Ve khong o trang thai dang xu ly (PROCESSING).');

    const service = await serviceRepo.findServiceById(client, ticket.service_id);
    const now = new Date();
    const durationSeconds = Math.round((now - new Date(ticket.processing_at)) / 1000);
    const slaStatus = durationSeconds <= service.sla_minutes * 60 ? 'ON_TIME' : 'LATE';

    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'COMPLETED', completed_at: now, handling_duration_seconds: durationSeconds, sla_status: slaStatus
    });
    await counterRepo.setActiveTicket(client, ticket.counter_id, null); // giai phong Active Slot
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'PROCESSING', toStatus: 'COMPLETED', counterId: ticket.counter_id, officerId,
      eventData: { event: 'COMPLETE', handling_duration_seconds: durationSeconds, sla_status: slaStatus }
    });
    return { ticket: updated, counterId: ticket.counter_id };
  });

  wsHub.broadcast(wsHub.EVENTS.TICKET_COMPLETED, {
    ticket: result.ticket, counterId: result.counterId, undoBufferSeconds
  });
  return result;
}

// Hoan tac trong Undo Buffer Delay neu can bo bam nham nut "Hoan tat".
async function undoComplete(ticketId, officerId) {
  const undoBufferSeconds = await configService.get('UNDO_BUFFER_SECONDS');

  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (ticket.status !== 'COMPLETED') throw new Error('Chi co the hoan tac ve vua duoc Hoan tat.');

    const elapsedSeconds = (Date.now() - new Date(ticket.completed_at).getTime()) / 1000;
    if (elapsedSeconds > undoBufferSeconds) {
      throw new Error(`Da het thoi gian hoan tac (${undoBufferSeconds}s).`);
    }

    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'PROCESSING', completed_at: null, handling_duration_seconds: null, sla_status: null
    });
    await counterRepo.setActiveTicket(client, ticket.counter_id, ticket.id);
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'COMPLETED', toStatus: 'PROCESSING', counterId: ticket.counter_id, officerId,
      eventData: { event: 'UNDO_COMPLETE' }
    });
    return { ticket: updated, counterId: ticket.counter_id };
  });

  wsHub.broadcast(wsHub.EVENTS.TICKET_PROCESSING, { ticket: result.ticket, undone: true });
  return result;
}

// Nhanh Sai/Thieu: PROCESSING -> SUPP_PENDING, cap ma QR Re-entry, giai phong quay ngay.
async function requestSupplement(ticketId, missingDocCodes, officerId) {
  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (ticket.status !== 'PROCESSING') throw new Error('Ve khong o trang thai dang xu ly (PROCESSING).');

    const reentryToken = crypto.randomBytes(24).toString('hex');
    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'SUPP_PENDING', missing_doc_codes: JSON.stringify(missingDocCodes || []), reentry_qr_token: reentryToken
    });
    await counterRepo.setActiveTicket(client, ticket.counter_id, null); // giai phong quay ngay lap tuc
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'PROCESSING', toStatus: 'SUPP_PENDING', counterId: ticket.counter_id, officerId,
      eventData: { event: 'REQUEST_SUPPLEMENT', missing_doc_codes: missingDocCodes }
    });
    return { ticket: updated, counterId: ticket.counter_id };
  });

  wsHub.broadcast(wsHub.EVENTS.TICKET_SUPP_PENDING, {
    ticket: result.ticket, reentryQrToken: result.ticket.reentry_qr_token
  });
  return result;
}

// Cong dan quet lai ma QR Re-entry sau khi bo sung tai Ban ke khai -> chen vao Active Slot + 2.
async function reentryScan(token) {
  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.findByReentryToken(client, token);
    if (!ticket) throw new Error('Ma QR khong hop le hoac da duoc su dung.');

    const minPos = await client.query(
      `SELECT COALESCE(MIN(queue_position), 1) AS min_pos FROM tickets
       WHERE counter_id = ? AND status = 'QUEUED'`,
      [ticket.counter_id]
    );
    const newPosition = Number(minPos.rows[0].min_pos) - 1; // Active Slot + 2: uu tien ngay sau ve VIP dang co (neu co)

    const updated = await ticketRepo.updateStatus(client, ticket.id, {
      status: 'QUEUED', queue_position: newPosition, missing_doc_codes: null, reentry_qr_token: null
    });
    await ticketRepo.insertHistory(client, {
      ticketId: ticket.id, fromStatus: 'SUPP_PENDING', toStatus: 'QUEUED', counterId: ticket.counter_id,
      eventData: { event: 'REENTRY_SCAN' }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.TICKET_REENTRY, { ticket: result });
  return result;
}

// -----------------------------------------------------------------------------------
// Priority / VIP Queue Injection: chen vao Active Slot + 1, bat buoc ly do + Audit Log.
// -----------------------------------------------------------------------------------
async function priorityInject({ serviceId, citizenName, phone, priorityReasonCode, counterId, adminId }) {
  if (!priorityReasonCode) throw new Error('Bat buoc chon ly do uu tien hop le tu danh muc cung.');
  // Admin Control Tower khong con thu thap Ho ten/SDT cong dan khi cap ve uu tien (chi dinh
  // danh bang So thu tu + Quay) - dung ten an danh, khong lam gian doan luong cap STT.
  const safeCitizenName = (citizenName && String(citizenName).trim()) || 'Công dân ưu tiên';

  const result = await withTransaction(async (client) => {
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

  const result = await withTransaction(async (client) => {
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

// -----------------------------------------------------------------------------------
// Emergency Skip: day 1 ho so nghi ngo gian lan / su co phap ly ra khoi bang chuyen.
// -----------------------------------------------------------------------------------
async function emergencySkip(ticketId, adminId, reason) {
  if (!reason) throw new Error('Bat buoc nhap ly do de ghi Audit Log.');

  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (['COMPLETED', 'CANCELLED', 'EXPIRED_EOD'].includes(ticket.status)) {
      throw new Error('Ve da o trang thai ket thuc, khong the Emergency Skip.');
    }

    if (ticket.counter_id) {
      const counter = await counterRepo.findById(client, ticket.counter_id);
      if (counter && counter.active_ticket_id === ticket.id) {
        await counterRepo.setActiveTicket(client, ticket.counter_id, null);
      }
    }
    clearNoShowTimeout(ticketId);

    const updated = await ticketRepo.updateStatus(client, ticketId, { status: 'CANCELLED', cancelled_at: new Date() });
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: ticket.status, toStatus: 'CANCELLED', counterId: ticket.counter_id, officerId: adminId,
      eventData: { event: 'EMERGENCY_SKIP', reason }
    });
    await auditRepo.insertLog(client, {
      adminId, action: 'EMERGENCY_SKIP', targetType: 'TICKET', targetId: ticketId, reason,
      payload: { ticketNumber: ticket.ticket_number }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.TICKET_CANCELLED, { ticket: result, outcome: 'EMERGENCY_SKIP' });
  return result;
}

// Khoi phuc ve huy nham.
async function restoreCancelledTicket(ticketId, adminId, reason) {
  const result = await withTransaction(async (client) => {
    const ticket = await ticketRepo.lockTicketById(client, ticketId);
    if (!ticket) throw new Error('Ve khong ton tai.');
    if (ticket.status !== 'CANCELLED') throw new Error('Chi co the khoi phuc ve dang o trang thai CANCELLED.');

    const tailPos = (await ticketRepo.maxQueuePositionForCounter(client, ticket.counter_id)) + 1;
    const updated = await ticketRepo.updateStatus(client, ticketId, {
      status: 'QUEUED', queue_position: tailPos, cancelled_at: null
    });
    await ticketRepo.insertHistory(client, {
      ticketId, fromStatus: 'CANCELLED', toStatus: 'QUEUED', counterId: ticket.counter_id, officerId: adminId,
      eventData: { event: 'RESTORE_CANCELLED_TICKET', reason }
    });
    await auditRepo.insertLog(client, {
      adminId, action: 'RESTORE_CANCELLED_TICKET', targetType: 'TICKET', targetId: ticketId, reason,
      payload: { ticketNumber: ticket.ticket_number }
    });
    return updated;
  });

  wsHub.broadcast(wsHub.EVENTS.QUEUE_REBALANCED, { ticket: result, outcome: 'RESTORED' });
  return result;
}

module.exports = {
  createTicket, callNext, acceptTicket, handleNoShow, manualNoShow,
  completeTicket, undoComplete, requestSupplement, reentryScan,
  priorityInject, forceRebalance, emergencySkip, restoreCancelledTicket,
  clearNoShowTimeout, buildAnnouncement
};
