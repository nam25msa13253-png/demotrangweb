// Kiem tra logic dieu phoi hang doi (queueEngine.js) MA KHONG can Postgres that: thay vi mock
// tung cau SQL (kho doc vi queueEngine goi qua nhieu lop repository), ta thay the TOAN BO ham
// cua tung repository + configService bang ban gia lap doc/ghi tren 1 "CSDL gia" nam trong bo
// nho (bien `state` duoi day). Vi cac repository/configService la module singleton (CommonJS
// cache theo duong dan tuyet doi), gan de len property cua chung se co hieu luc ngay ca voi
// tham chieu ma queueEngine.js da require - CHI RIENG `withTransaction` la bi destructure
// truc tiep luc top-level (`const { withTransaction } = require(...)`) nen phai xoa
// require.cache cua queueEngine truoc moi test de no doc lai ban gia lap moi nhat.
//
// Luu y quan trong: cac ham co the kich hoat scheduleNoShowTimeout (callNext, va handleNoShow
// nhanh REQUEUED vi no tu dong goi lai callNext) se tao 1 setTimeout that. Neu khong huy bang
// queueEngine.clearNoShowTimeout(...), timer se treo tien trinh `node --test` cho toi khi no
// tu bien (mac dinh 45s) - moi test lien quan deu phai don dep timer truoc khi ket thuc.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const configService = require('../src/config/configService');
const ticketRepo = require('../src/repositories/ticketRepository');
const counterRepo = require('../src/repositories/counterRepository');
const serviceRepo = require('../src/repositories/serviceRepository');
const auditRepo = require('../src/repositories/auditRepository');

let state;
let ticketSeq;

function resetState() {
  state = {
    counters: [
      { id: 'c1', field_id: 1, status: 'OPEN', active_ticket_id: null },
      { id: 'c2', field_id: 1, status: 'OPEN', active_ticket_id: null },
      { id: 'c3', field_id: 2, status: 'OPEN', active_ticket_id: null }
    ],
    tickets: [],
    services: [
      { id: 's1', field_id: 1, ticket_prefix: 'A', sla_minutes: 15, short_alias: 'Khai sinh', name: 'Đăng ký khai sinh' }
    ],
    priorityReasons: [{ id: 'pr1', code: 'ELDERLY', label: 'Người cao tuổi' }],
    auditLogs: []
  };
  ticketSeq = 1;
}

function findTicket(id) { return state.tickets.find((t) => t.id === id) || null; }
function cloneTicket(t) { return t ? { ...t } : null; }

beforeEach(() => {
  resetState();

  // Client gia dung cho 2 truy van SQL tho ma queueEngine.js goi truc tiep (khong qua
  // repository): tra cuu danh muc cung `priority_reasons` va tinh MIN(queue_position) dung
  // trong ca reentryScan lan priorityInject.
  const fakeClient = {
    query: async (sql, params) => {
      if (sql.includes('priority_reasons')) {
        const reason = state.priorityReasons.find((r) => r.code === params[0]);
        return { rows: reason ? [reason] : [] };
      }
      if (sql.includes('MIN(queue_position)')) {
        const positions = state.tickets
          .filter((t) => t.counter_id === params[0] && t.status === 'QUEUED')
          .map((t) => t.queue_position);
        return { rows: [{ min_pos: positions.length ? Math.min(...positions) : 1 }] };
      }
      throw new Error(`Cau SQL khong duoc gia lap trong test: ${sql}`);
    }
  };
  db.withTransaction = async (fn) => fn(fakeClient);

  configService.get = async (key) => ({
    CALL_TIMEOUT_SECONDS: 45,
    MAX_RETRY_COUNT: 3,
    UNDO_BUFFER_SECONDS: 5
  }[key]);

  serviceRepo.findServiceById = async (_client, id) => {
    const s = state.services.find((x) => x.id === id);
    return s ? { ...s } : null;
  };

  counterRepo.findLeastLoadedByField = async (_client, fieldId, excludeCounterId) => {
    const candidates = state.counters.filter((c) => c.field_id === fieldId && c.status === 'OPEN' && c.id !== excludeCounterId);
    if (!candidates.length) return null;
    const withLoad = candidates.map((c) => ({
      c, load: state.tickets.filter((t) => t.counter_id === c.id && ['QUEUED', 'CALLING', 'PROCESSING'].includes(t.status)).length
    }));
    withLoad.sort((a, b) => a.load - b.load || (a.c.id > b.c.id ? 1 : -1));
    return { ...withLoad[0].c };
  };
  counterRepo.lockById = async (_client, id) => {
    const c = state.counters.find((x) => x.id === id);
    return c ? { ...c } : null;
  };
  counterRepo.findById = async (_client, id) => {
    const c = state.counters.find((x) => x.id === id);
    return c ? { ...c } : null;
  };
  counterRepo.setActiveTicket = async (_client, counterId, ticketId) => {
    const c = state.counters.find((x) => x.id === counterId);
    if (c) c.active_ticket_id = ticketId;
    return c ? { ...c } : null;
  };

  ticketRepo.countTodayByField = async (_client, fieldId) => state.tickets.filter((t) => {
    const s = state.services.find((sv) => sv.id === t.service_id);
    return s && s.field_id === fieldId;
  }).length;

  ticketRepo.maxQueuePositionForCounter = async (_client, counterId) => {
    const positions = state.tickets
      .filter((t) => t.counter_id === counterId && ['QUEUED', 'CALLING', 'PROCESSING'].includes(t.status))
      .map((t) => t.queue_position || 0);
    return positions.length ? Math.max(...positions) : 0;
  };

  ticketRepo.insertTicket = async (_client, { ticketNumber, serviceId, counterId, citizenName, phone, isPriority, priorityReasonId, queuePosition }) => {
    const ticket = {
      id: `t${ticketSeq++}`, ticket_number: ticketNumber, service_id: serviceId, counter_id: counterId,
      citizen_name: citizenName, phone: phone || '', status: 'QUEUED', retry_count: 0,
      is_priority: !!isPriority, priority_reason_id: priorityReasonId || null, queue_position: queuePosition,
      called_at: null, processing_at: null, completed_at: null, cancelled_at: null,
      missing_doc_codes: null, reentry_qr_token: null, handling_duration_seconds: null, sla_status: null
    };
    state.tickets.push(ticket);
    return cloneTicket(ticket);
  };
  ticketRepo.insertHistory = async () => {};
  ticketRepo.lockTicketById = async (_client, id) => cloneTicket(findTicket(id));
  ticketRepo.findNextQueuedForCounter = async (_client, counterId) => {
    const candidates = state.tickets
      .filter((t) => t.counter_id === counterId && t.status === 'QUEUED')
      .sort((a, b) => (b.is_priority - a.is_priority) || (a.queue_position - b.queue_position));
    return cloneTicket(candidates[0] || null);
  };
  ticketRepo.updateStatus = async (_client, id, fields) => {
    const t = findTicket(id);
    if (!t) return null;
    Object.assign(t, fields);
    return cloneTicket(t);
  };
  ticketRepo.findByReentryToken = async (_client, token) => cloneTicket(
    state.tickets.find((t) => t.reentry_qr_token === token && t.status === 'SUPP_PENDING')
  );
  ticketRepo.countActiveForCounter = async (_client, counterId) => state.tickets.filter(
    (t) => t.counter_id === counterId && ['QUEUED', 'CALLING', 'PROCESSING'].includes(t.status)
  ).length;
  ticketRepo.listTailQueued = async (_client, counterId, limit) => state.tickets
    .filter((t) => t.counter_id === counterId && t.status === 'QUEUED')
    .sort((a, b) => (a.is_priority - b.is_priority) || (b.queue_position - a.queue_position))
    .slice(0, limit)
    .map(cloneTicket);
  ticketRepo.reassignCounter = async (_client, id, newCounterId, newQueuePosition) => {
    const t = findTicket(id);
    if (t) { t.counter_id = newCounterId; t.queue_position = newQueuePosition; }
    return cloneTicket(t);
  };

  auditRepo.insertLog = async (_client, entry) => { state.auditLogs.push(entry); };

  delete require.cache[require.resolve('../src/services/queueEngine')];
});

test('createTicket: gan vao quay it tai nhat (Least Queue Depth) trong cung linh vuc', async () => {
  state.tickets.push({ id: 'seed1', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 1 });
  state.tickets.push({ id: 'seed2', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 2 });
  const queueEngine = require('../src/services/queueEngine');
  const { ticket, counter } = await queueEngine.createTicket({ serviceId: 's1', citizenName: 'Khach Kiosk', phone: '' });
  assert.equal(counter.id, 'c2');
  assert.equal(ticket.ticket_number, 'A-103');
});

test('createTicket: nem loi NO_COUNTER_AVAILABLE khi khong co quay nao dang mo cho linh vuc', async () => {
  state.counters.forEach((c) => { if (c.field_id === 1) c.status = 'CLOSED'; });
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(
    () => queueEngine.createTicket({ serviceId: 's1', citizenName: 'X', phone: '' }),
    (err) => { assert.equal(err.code, 'NO_COUNTER_AVAILABLE'); return true; }
  );
});

test('callNext: tra ve null khi hang doi cua quay dang rong', async () => {
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.callNext('c1', 'officer1');
  assert.equal(result, null);
});

test('callNext: chuyen ve dau hang doi sang CALLING va chiem Active Slot cua quay', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 1, is_priority: false });
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.callNext('c1', 'officer1');
  assert.equal(result.ticket.status, 'CALLING');
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, 't1');
  queueEngine.clearNoShowTimeout('t1');
});

test('acceptTicket: chuyen CALLING -> PROCESSING', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'CALLING' });
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.acceptTicket('t1', 'officer1');
  assert.equal(result.status, 'PROCESSING');
});

test('acceptTicket: tu choi neu ve khong o trang thai CALLING', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'QUEUED' });
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.acceptTicket('t1', 'officer1'), /CALLING/);
});

test('handleNoShow: vang mat lan dau (< Max Retry) -> day ve cuoi hang doi, tang retry_count', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'CALLING', queue_position: 1, retry_count: 0, is_priority: false });
  state.counters.find((c) => c.id === 'c1').active_ticket_id = 't1';
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.handleNoShow('t1');
  // Snapshot tra ve tai thoi diem doi sang QUEUED, TRUOC khi handleNoShow tu dong goi lai
  // callNext() o cuoi ham (vong lap phuc vu quay lien tuc) - vi day la ve DUY NHAT con trong
  // hang doi cua quay nay, no se lap tuc duoc goi lai va tro thanh CALLING trong state that.
  assert.equal(result.outcome, 'REQUEUED');
  assert.equal(result.ticket.retry_count, 1);
  assert.equal(result.ticket.status, 'QUEUED');
  const liveTicket = findTicket('t1');
  assert.equal(liveTicket.status, 'CALLING');
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, 't1');
  queueEngine.clearNoShowTimeout('t1'); // huy timer moi do auto callNext() sinh ra
});

test('handleNoShow: vang mat du Max Retry (3 lan) -> 3-Strike Drop, huy ve vinh vien', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'CALLING', queue_position: 1, retry_count: 2, is_priority: false });
  state.counters.find((c) => c.id === 'c1').active_ticket_id = 't1';
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.handleNoShow('t1');
  assert.equal(result.outcome, 'CANCELLED');
  assert.equal(result.ticket.retry_count, 3);
  assert.equal(result.ticket.status, 'CANCELLED');
});

test('handleNoShow: bo qua (tra ve null) neu ve da duoc xu ly truoc khi timer no', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'PROCESSING', retry_count: 0 });
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.handleNoShow('t1');
  assert.equal(result, null);
});

test('completeTicket: SLA_STATUS = ON_TIME khi xu ly trong han', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'PROCESSING', processing_at: new Date(Date.now() - 5 * 60 * 1000) });
  const queueEngine = require('../src/services/queueEngine');
  const { ticket } = await queueEngine.completeTicket('t1', 'officer1');
  assert.equal(ticket.status, 'COMPLETED');
  assert.equal(ticket.sla_status, 'ON_TIME');
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, null);
});

test('completeTicket: SLA_STATUS = LATE khi vuot han xu ly (sla_minutes cua thu tuc)', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'PROCESSING', processing_at: new Date(Date.now() - 20 * 60 * 1000) });
  const queueEngine = require('../src/services/queueEngine');
  const { ticket } = await queueEngine.completeTicket('t1', 'officer1');
  assert.equal(ticket.sla_status, 'LATE');
});

test('undoComplete: hoan tac thanh cong trong Undo Buffer, tra ve Active Slot cho quay', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'COMPLETED', completed_at: new Date() });
  const queueEngine = require('../src/services/queueEngine');
  const { ticket } = await queueEngine.undoComplete('t1', 'officer1');
  assert.equal(ticket.status, 'PROCESSING');
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, 't1');
});

test('undoComplete: tu choi khi da het thoi gian Undo Buffer', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'COMPLETED', completed_at: new Date(Date.now() - 10 * 1000) });
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.undoComplete('t1', 'officer1'), /het thoi gian hoan tac/);
});

test('requestSupplement: chuyen SUPP_PENDING, cap ma Re-entry va giai phong quay ngay lap tuc', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'PROCESSING' });
  state.counters.find((c) => c.id === 'c1').active_ticket_id = 't1';
  const queueEngine = require('../src/services/queueEngine');
  const { ticket } = await queueEngine.requestSupplement('t1', ['CMND'], 'officer1');
  assert.equal(ticket.status, 'SUPP_PENDING');
  assert.ok(ticket.reentry_qr_token && ticket.reentry_qr_token.length > 0);
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, null);
});

test('reentryScan: tu choi ma QR khong hop le hoac da duoc su dung', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.reentryScan('token-khong-ton-tai'), /khong hop le/);
});

test('reentryScan: chen lai vao QUEUED, uu tien hon toan bo hang doi hien tai (Active Slot + 2)', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'SUPP_PENDING', reentry_qr_token: 'tok123' });
  state.tickets.push({ id: 't2', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 5 });
  const queueEngine = require('../src/services/queueEngine');
  const ticket = await queueEngine.reentryScan('tok123');
  assert.equal(ticket.status, 'QUEUED');
  assert.equal(ticket.queue_position, 4);
  assert.equal(ticket.reentry_qr_token, null);
});

test('priorityInject: bat buoc ly do uu tien hop le, tu choi neu thieu', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.priorityInject({ serviceId: 's1', priorityReasonCode: null }), /Bat buoc chon ly do/);
});

test('priorityInject: tu choi ma ly do khong nam trong danh muc cung', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(
    () => queueEngine.priorityInject({ serviceId: 's1', priorityReasonCode: 'KHONG_TON_TAI', counterId: 'c1' }),
    /khong hop le/
  );
});

test('priorityInject: chen vao Active Slot + 1 va bat buoc ghi Audit Log', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 5 });
  const queueEngine = require('../src/services/queueEngine');
  const { ticket } = await queueEngine.priorityInject({ serviceId: 's1', priorityReasonCode: 'ELDERLY', counterId: 'c1', adminId: 'admin1' });
  assert.equal(ticket.is_priority, true);
  assert.equal(ticket.queue_position, 4);
  assert.equal(state.auditLogs.length, 1);
  assert.equal(state.auditLogs[0].action, 'PRIORITY_INJECT');
});

test('forceRebalance: tu choi ty le san tai ngoai khoang 1-100%', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(
    () => queueEngine.forceRebalance({ fromCounterId: 'c1', toCounterId: 'c2', percent: 0, adminId: 'a1' }),
    /1-100%/
  );
});

test('forceRebalance: tu choi san tai giua 2 quay khac nhom linh vuc', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(
    () => queueEngine.forceRebalance({ fromCounterId: 'c1', toCounterId: 'c3', percent: 50, adminId: 'a1' }),
    /cung nhom linh vuc/
  );
});

test('forceRebalance: trich dung so ve o duoi hang doi (lam tron len) sang quay ranh cung linh vuc', async () => {
  for (let i = 1; i <= 4; i += 1) {
    state.tickets.push({ id: `t${i}`, service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: i, is_priority: false });
  }
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.forceRebalance({ fromCounterId: 'c1', toCounterId: 'c2', percent: 50, adminId: 'a1' });
  assert.equal(result.moved.length, 2); // Math.ceil(4 * 50 / 100)
  assert.ok(result.moved.every((t) => t.counter_id === 'c2'));
  assert.equal(state.auditLogs[0].action, 'FORCE_REBALANCE');
});

test('emergencySkip: bat buoc nhap ly do de ghi Audit Log', async () => {
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.emergencySkip('t1', 'admin1', ''), /Bat buoc nhap ly do/);
});

test('emergencySkip: tu choi neu ve da o trang thai ket thuc (VD da COMPLETED)', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'COMPLETED' });
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.emergencySkip('t1', 'admin1', 'Nghi ngo gian lan'), /da o trang thai ket thuc/);
});

test('emergencySkip: huy ve va giai phong Active Slot neu dang la ve chiem quay', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'PROCESSING' });
  state.counters.find((c) => c.id === 'c1').active_ticket_id = 't1';
  const queueEngine = require('../src/services/queueEngine');
  const result = await queueEngine.emergencySkip('t1', 'admin1', 'Nghi ngo gian lan');
  assert.equal(result.status, 'CANCELLED');
  assert.equal(state.counters.find((c) => c.id === 'c1').active_ticket_id, null);
  assert.equal(state.auditLogs[0].action, 'EMERGENCY_SKIP');
});

test('restoreCancelledTicket: chi cho phep khoi phuc ve dang o trang thai CANCELLED', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'QUEUED' });
  const queueEngine = require('../src/services/queueEngine');
  await assert.rejects(() => queueEngine.restoreCancelledTicket('t1', 'admin1', 'Huy nham'), /CANCELLED/);
});

test('restoreCancelledTicket: khoi phuc ve cuoi hang doi va bat buoc ghi Audit Log', async () => {
  state.tickets.push({ id: 't1', service_id: 's1', counter_id: 'c1', status: 'CANCELLED', cancelled_at: new Date() });
  state.tickets.push({ id: 't2', service_id: 's1', counter_id: 'c1', status: 'QUEUED', queue_position: 3 });
  const queueEngine = require('../src/services/queueEngine');
  const ticket = await queueEngine.restoreCancelledTicket('t1', 'admin1', 'Huy nham');
  assert.equal(ticket.status, 'QUEUED');
  assert.equal(ticket.queue_position, 4);
  assert.equal(state.auditLogs[0].action, 'RESTORE_CANCELLED_TICKET');
});

test('buildAnnouncement: dung dinh dang loa PA, uu tien short_alias, KHONG doc ten cong dan', () => {
  const queueEngine = require('../src/services/queueEngine');
  const msg = queueEngine.buildAnnouncement(
    { ticket_number: 'A-101' },
    { short_alias: 'Khai sinh', name: 'Đăng ký khai sinh' },
    { name: 'Quầy 01' }
  );
  assert.equal(msg, 'Mời số A-101, làm thủ tục Khai sinh, đến Quầy 01');
});
