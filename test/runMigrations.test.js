// Kiem tra addSoftDeleteToCounters() - dung ham nay tung gay crash that tren Render: truoc day
// no chay `ALTER TABLE counters ALTER COLUMN code TYPE VARCHAR(60)` VO DIEU KIEN moi lan server
// khoi dong. Sau khi VIEW active_counters (SELECT * FROM counters) duoc tao, Postgres tu choi
// ALTER COLUMN TYPE tren cot ma VIEW dang phu thuoc - DU LA DOI SANG DUNG KIEU NO DANG CO - nen
// tu lan khoi dong thu 2 tro di (sau khi VIEW da ton tai) server LUON LUON crash ngay o buoc
// migrate. Fix: chi chay ALTER neu cot chua du rong (< 60 ky tu). Test nay xac nhan ca 2 nhanh
// de tranh tai dien loi tuong tu.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const runMigrations = require('../src/migrations/runMigrations');

let queries;

beforeEach(() => {
  queries = [];
});

function mockPoolQuery(codeColumnLength) {
  return async (sql, params) => {
    queries.push(sql);
    if (sql.includes('information_schema.columns')) {
      return { rows: [{ character_maximum_length: codeColumnLength }] };
    }
    if (sql.includes('INSERT INTO system_configs')) return { rows: [] };
    return { rows: [] };
  };
}

test('addSoftDeleteToCounters: KHONG chay ALTER COLUMN neu cot code da du rong (>= 60) - dung khi VIEW active_counters da ton tai', async () => {
  db.pool.query = mockPoolQuery(60);
  await runMigrations.addSoftDeleteToCounters();
  const alterCalls = queries.filter((q) => q.includes('ALTER COLUMN code TYPE'));
  assert.equal(alterCalls.length, 0);
});

test('addSoftDeleteToCounters: CO chay ALTER COLUMN neu cot code van con hep (< 60) - truong hop DB cu chua nang cap', async () => {
  db.pool.query = mockPoolQuery(20);
  await runMigrations.addSoftDeleteToCounters();
  const alterCalls = queries.filter((q) => q.includes('ALTER COLUMN code TYPE'));
  assert.equal(alterCalls.length, 1);
});

test('addSoftDeleteToCounters: CO chay ALTER COLUMN neu chua doc duoc do rong cot (rows rong/null)', async () => {
  db.pool.query = mockPoolQuery(null);
  await runMigrations.addSoftDeleteToCounters();
  const alterCalls = queries.filter((q) => q.includes('ALTER COLUMN code TYPE'));
  assert.equal(alterCalls.length, 1);
});
