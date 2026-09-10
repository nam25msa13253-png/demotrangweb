// Thao tac can thiep khan cap cua Admin (khong nam trong vong doi tu dong cua 1 ve): day 1 ho
// so nghi ngo gian lan ra khoi bang chuyen, hoac khoi phuc ve huy nham. Deu bat buoc ly do + ghi
// Audit Log.
const db = require('../../config/db');
const ticketRepo = require('../../repositories/ticketRepository');
const counterRepo = require('../../repositories/counterRepository');
const auditRepo = require('../../repositories/auditRepository');
const wsHub = require('../../websocket/wsHub');
const { clearNoShowTimeout } = require('./ticketLifecycle');

// -----------------------------------------------------------------------------------
// Emergency Skip: day 1 ho so nghi ngo gian lan / su co phap ly ra khoi bang chuyen.
// -----------------------------------------------------------------------------------
async function emergencySkip(ticketId, adminId, reason) {
  if (!reason) throw new Error('Bat buoc nhap ly do de ghi Audit Log.');

  const result = await db.withTransaction(async (client) => {
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
  const result = await db.withTransaction(async (client) => {
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

module.exports = { emergencySkip, restoreCancelledTicket };
