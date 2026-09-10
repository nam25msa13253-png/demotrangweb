// Kiem tra counterService.js (Mo/Dong/Tam dung quay, doi linh vuc, xoa quay, gan can bo) MA
// KHONG can Postgres that - cung 1 ky thuat mock repository/withTransaction nhu trong
// test/queueEngine.test.js: thay toan bo ham repository bang ban gia lap doc/ghi tren 1 "CSDL
// gia" trong bo nho. wsHub.broadcast() tu no-op khi chua goi wsHub.init() (wss = null) nen
// khong can mock rieng.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const counterRepo = require('../src/repositories/counterRepository');
const staffRepo = require('../src/repositories/staffRepository');
const ticketRepo = require('../src/repositories/ticketRepository');
const auditRepo = require('../src/repositories/auditRepository');

let state;

function resetState() {
  state = {
    counters: [
      { id: 1, field_id: 1, status: 'OPEN', active_ticket_id: null, code: 'QUAY-01', name: 'Quầy 01' },
      { id: 2, field_id: 1, status: 'OPEN', active_ticket_id: null, code: 'QUAY-02', name: 'Quầy 02' },
      { id: 3, field_id: 2, status: 'OPEN', active_ticket_id: null, code: 'QUAY-03', name: 'Quầy 03' }
    ],
    tickets: [],
    staff: [
      { id: 'off-1', role: 'OFFICER', is_active: true },
      { id: 'off-locked', role: 'OFFICER', is_active: false },
      { id: 'sup-1', role: 'SUPERVISOR', is_active: true }
    ],
    auditLogs: []
  };
}

function findCounter(id) { return state.counters.find((c) => c.id === id) || null; }
function cloneCounter(c) { return c ? { ...c } : null; }

beforeEach(() => {
  resetState();
  db.withTransaction = async (fn) => fn({});

  counterRepo.lockById = async (_client, id) => cloneCounter(findCounter(id));
  counterRepo.findById = async (_client, id) => cloneCounter(findCounter(id));
  counterRepo.updateStatus = async (_client, id, status) => {
    const c = findCounter(id);
    if (c) c.status = status;
    return cloneCounter(c);
  };
  counterRepo.updateField = async (_client, id, fieldId) => {
    const c = findCounter(id);
    if (c) c.field_id = fieldId;
    return cloneCounter(c);
  };
  counterRepo.create = async (_client, { code, name, fieldId }) => {
    const c = { id: state.counters.length + 1, code, name, field_id: fieldId, status: 'CLOSED', active_ticket_id: null };
    state.counters.push(c);
    return cloneCounter(c);
  };
  counterRepo.updateDetails = async (_client, id, { code, name }) => {
    const c = findCounter(id);
    if (c) { c.code = code; c.name = name; }
    return cloneCounter(c);
  };
  counterRepo.softDelete = async (_client, id, archivedCode) => {
    const c = findCounter(id);
    if (c) { c.is_deleted = 1; c.status = 'CLOSED'; c.officer_id = null; c.active_ticket_id = null; c.code = archivedCode; }
  };
  counterRepo.findLeastLoadedByField = async (_client, fieldId, excludeCounterId) => {
    const candidates = state.counters.filter((c) => c.field_id === fieldId && c.status === 'OPEN' && c.id !== excludeCounterId && !c.is_deleted);
    if (!candidates.length) return null;
    const withLoad = candidates.map((c) => ({
      c, load: state.tickets.filter((t) => t.counter_id === c.id && t.status === 'QUEUED').length
    }));
    withLoad.sort((a, b) => a.load - b.load || a.c.id - b.c.id);
    return cloneCounter(withLoad[0].c);
  };
  counterRepo.clearOfficerFromOtherCounters = async (_client, officerId, exceptCounterId) => {
    state.counters.forEach((c) => { if (c.officer_id === officerId && c.id !== exceptCounterId) c.officer_id = null; });
  };
  counterRepo.updateOfficer = async (_client, id, officerId) => {
    const c = findCounter(id);
    if (c) c.officer_id = officerId;
    return cloneCounter(c);
  };

  staffRepo.findById = async (_client, id) => {
    const s = state.staff.find((x) => x.id === id);
    return s ? { ...s } : null;
  };

  ticketRepo.listQueueForCounter = async (_client, counterId) => state.tickets.filter((t) => t.counter_id === counterId);
  ticketRepo.maxQueuePositionForCounter = async (_client, counterId) => {
    const positions = state.tickets.filter((t) => t.counter_id === counterId).map((t) => t.queue_position || 0);
    return positions.length ? Math.max(...positions) : 0;
  };
  ticketRepo.reassignCounter = async (_client, id, newCounterId, newQueuePosition) => {
    const t = state.tickets.find((x) => x.id === id);
    if (t) { t.counter_id = newCounterId; t.queue_position = newQueuePosition; }
    return t ? { ...t } : null;
  };
  ticketRepo.insertHistory = async () => {};

  auditRepo.insertLog = async (_client, entry) => { state.auditLogs.push(entry); };

  delete require.cache[require.resolve('../src/services/counterService')];
});

test('setCounterStatus: tu choi trang thai khong hop le', async () => {
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.setCounterStatus(1, 'INVALID', 'admin1', ''), /khong hop le/);
});

test('setCounterStatus: OPEN -> PAUSED tu dong chuyen het ve QUEUED sang quay khac cung linh vuc', async () => {
  state.tickets.push({ id: 't1', counter_id: 1, status: 'QUEUED', queue_position: 1 });
  state.tickets.push({ id: 't2', counter_id: 1, status: 'QUEUED', queue_position: 2 });
  const counterService = require('../src/services/counterService');
  const outcome = await counterService.setCounterStatus(1, 'PAUSED', 'admin1', 'Nghi giai lao');
  assert.equal(outcome.counter.status, 'PAUSED');
  assert.equal(outcome.movedCount, 2);
  assert.equal(outcome.targetCounterId, 2);
  assert.ok(state.tickets.every((t) => t.counter_id === 2));
  assert.equal(state.auditLogs[0].action, 'COUNTER_STATUS_CHANGE');
});

test('setCounterStatus: chuyen sang OPEN khong kich hoat san tai (khong co ve nao bi day di)', async () => {
  state.counters.find((c) => c.id === 1).status = 'PAUSED';
  state.tickets.push({ id: 't1', counter_id: 1, status: 'QUEUED', queue_position: 1 });
  const counterService = require('../src/services/counterService');
  const outcome = await counterService.setCounterStatus(1, 'OPEN', 'admin1', '');
  assert.equal(outcome.movedCount, 0);
  assert.equal(state.tickets[0].counter_id, 1);
});

test('changeCounterField: tu choi khi quay dang xu ly ve (active_ticket_id khac null)', async () => {
  state.counters.find((c) => c.id === 1).active_ticket_id = 't1';
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.changeCounterField(1, 2, 'admin1', ''), /dang xu ly ve/);
});

test('changeCounterField: doi linh vuc thanh cong va ghi Audit Log', async () => {
  const counterService = require('../src/services/counterService');
  const result = await counterService.changeCounterField(1, 2, 'admin1', 'Doi linh vuc');
  assert.equal(result.field_id, 2);
  assert.equal(state.auditLogs[0].action, 'COUNTER_FIELD_CHANGE');
});

test('createCounter: tao quay moi va ghi Audit Log', async () => {
  const counterService = require('../src/services/counterService');
  const result = await counterService.createCounter('QUAY-04', 'Quầy 04', 1, 'admin1');
  assert.equal(result.code, 'QUAY-04');
  assert.equal(state.auditLogs[0].action, 'COUNTER_CREATED');
});

test('updateCounterDetails: nem loi ro rang khi quay khong ton tai', async () => {
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.updateCounterDetails(999, 'X', 'Y', 'admin1'), /khong ton tai/);
});

test('updateCounterDetails: cap nhat ma/ten va ghi Audit Log', async () => {
  const counterService = require('../src/services/counterService');
  const result = await counterService.updateCounterDetails(1, 'QUAY-01B', 'Quầy 01B', 'admin1');
  assert.equal(result.code, 'QUAY-01B');
  assert.equal(state.auditLogs[0].action, 'COUNTER_UPDATED');
});

test('deleteCounter: tu choi khi quay dang xu ly ve', async () => {
  state.counters.find((c) => c.id === 1).active_ticket_id = 't1';
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.deleteCounter(1, 'admin1', ''), /dang xu ly ve/);
});

test('deleteCounter: tu choi khi la quay mo duy nhat cua linh vuc va con ve dang cho (blockedCount > 0)', async () => {
  state.counters.find((c) => c.id === 3).status = 'OPEN'; // QUAY-03 la quay duy nhat linh vuc 2
  state.tickets.push({ id: 't1', counter_id: 3, status: 'QUEUED', queue_position: 1 });
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.deleteCounter(3, 'admin1', ''), /quay dang mo duy nhat/);
});

test('deleteCounter: xoa mem thanh cong, doi ma quay sang dang luu tru va chuyen het ve sang quay khac', async () => {
  state.tickets.push({ id: 't1', counter_id: 1, status: 'QUEUED', queue_position: 1 });
  const counterService = require('../src/services/counterService');
  const outcome = await counterService.deleteCounter(1, 'admin1', 'Giai the quay');
  assert.equal(outcome.movedCount, 1);
  assert.equal(outcome.targetCounterId, 2);
  const deleted = findCounter(1);
  assert.equal(deleted.is_deleted, 1);
  assert.match(deleted.code, /^QUAY-01-DEL-\d+$/);
  assert.equal(state.auditLogs[0].action, 'COUNTER_DELETED');
});

test('assignOfficer: tu choi neu can bo khong ton tai', async () => {
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.assignOfficer(1, 'khong-ton-tai', 'admin1', ''), /Can bo khong ton tai/);
});

test('assignOfficer: tu choi neu tai khoan khong phai vai tro Officer', async () => {
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.assignOfficer(1, 'sup-1', 'admin1', ''), /vai tro Officer/);
});

test('assignOfficer: tu choi neu tai khoan Officer dang bi khoa', async () => {
  const counterService = require('../src/services/counterService');
  await assert.rejects(() => counterService.assignOfficer(1, 'off-locked', 'admin1', ''), /dang bi khoa/);
});

test('assignOfficer: gan thanh cong, tu dong go khoi cac quay khac dang phu trach', async () => {
  state.counters.find((c) => c.id === 2).officer_id = 'off-1'; // dang phu trach quay 2
  const counterService = require('../src/services/counterService');
  const result = await counterService.assignOfficer(1, 'off-1', 'admin1', '');
  assert.equal(result.officer_id, 'off-1');
  assert.equal(findCounter(2).officer_id, null); // da bi go khoi quay cu
  assert.equal(state.auditLogs[0].action, 'COUNTER_OFFICER_ASSIGNED');
});

test('assignOfficer: go can bo khoi quay khi officerId = null', async () => {
  state.counters.find((c) => c.id === 1).officer_id = 'off-1';
  const counterService = require('../src/services/counterService');
  const result = await counterService.assignOfficer(1, null, 'admin1', '');
  assert.equal(result.officer_id, null);
});
