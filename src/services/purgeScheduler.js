const { withTransaction } = require('../config/db');
const configService = require('../config/configService');
const ticketRepo = require('../repositories/ticketRepository');
const counterRepo = require('../repositories/counterRepository');
const auditRepo = require('../repositories/auditRepository');
const wsHub = require('../websocket/wsHub');

let lastEodPurgeDate = null; // ISO date string, dam bao Batch Purge chi chay 1 lan / ngay

// Max Ticket Lifetime: quet don lien tuc cac ve QUEUED/CALLING ton tai qua lau (vd vang mat lien tuc bi bo quen).
async function sweepMaxLifetime() {
  const lifetimeMinutes = await configService.get('MAX_TICKET_LIFETIME_MINUTES');
  const cutoff = new Date(Date.now() - lifetimeMinutes * 60 * 1000);

  const expiredIds = await withTransaction(async (client) => {
    const expired = await ticketRepo.findExpiredForPurge(client, cutoff);
    const ids = [];
    for (const t of expired) {
      await ticketRepo.updateStatus(client, t.id, { status: 'EXPIRED_EOD' });
      if (t.counter_id) {
        const counter = await counterRepo.findById(client, t.counter_id);
        if (counter && counter.active_ticket_id === t.id) await counterRepo.setActiveTicket(client, t.counter_id, null);
      }
      await ticketRepo.insertHistory(client, {
        ticketId: t.id, fromStatus: t.status, toStatus: 'EXPIRED_EOD', counterId: t.counter_id,
        eventData: { event: 'MAX_LIFETIME_EXPIRED' }
      });
      ids.push(t.id);
    }
    return ids;
  });

  if (expiredIds.length > 0) {
    wsHub.broadcast(wsHub.EVENTS.EOD_PURGE, { type: 'MAX_LIFETIME_SWEEP', count: expiredIds.length, ticketIds: expiredIds });
  }
}

// End-of-Day Batch Purge: 17:00 chuyen toan bo ve QUEUED/CALLING con sot lai sang EXPIRED_EOD.
async function runEodPurgeIfDue() {
  const purgeHour = await configService.get('EOD_PURGE_HOUR');
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  if (now.getHours() < purgeHour) return;
  if (lastEodPurgeDate === todayKey) return; // da chay hom nay roi

  const { totalUnserved, ticketIds } = await withTransaction(async (client) => {
    const remaining = await ticketRepo.findAllQueuedAndCallingForEOD(client);
    const ids = [];
    for (const t of remaining) {
      await ticketRepo.updateStatus(client, t.id, { status: 'EXPIRED_EOD' });
      await ticketRepo.insertHistory(client, {
        ticketId: t.id, fromStatus: t.status, toStatus: 'EXPIRED_EOD', counterId: t.counter_id,
        eventData: { event: 'EOD_BATCH_PURGE' }
      });
      ids.push(t.id);
    }
    // Reset active_ticket_id cua tat ca quay va dong phien lam viec trong ngay
    await client.query('UPDATE counters SET active_ticket_id = NULL');
    await auditRepo.insertLog(client, {
      adminId: null, action: 'EOD_BATCH_PURGE', targetType: 'SYSTEM', targetId: 'ALL',
      reason: `Dong phien lam viec ${todayKey} luc ${purgeHour}:00`,
      payload: { totalUnserved: ids.length, ticketIds: ids }
    });
    return { totalUnserved: ids.length, ticketIds: ids };
  });

  lastEodPurgeDate = todayKey;
  wsHub.broadcast(wsHub.EVENTS.EOD_PURGE, { type: 'EOD_BATCH_PURGE', totalUnserved, ticketIds, date: todayKey });
  console.log(`[purgeScheduler] EOD Batch Purge hoan tat: ${totalUnserved} ve chua xu ly bi huy.`);
}

function start() {
  // Chay moi 60s: kiem tra EOD va quet Max Lifetime. Du du chay xen ke ma khong can node-cron.
  setInterval(() => {
    sweepMaxLifetime().catch((err) => console.error('[purgeScheduler] Loi sweepMaxLifetime:', err));
    runEodPurgeIfDue().catch((err) => console.error('[purgeScheduler] Loi runEodPurgeIfDue:', err));
  }, 60 * 1000);
  console.log('[purgeScheduler] Da khoi dong (chu ky kiem tra 60s).');
}

module.exports = { start, sweepMaxLifetime, runEodPurgeIfDue };
