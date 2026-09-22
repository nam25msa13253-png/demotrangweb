const { Pool } = require('pg');

// Chuyen placeholder kieu MySQL (?) sang kieu Postgres ($1, $2, ...) de toan bo
// repositories/services giu nguyen cach viet SQL cu, khong phai sua tung cau.
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// DATABASE_URL (chuoi ket noi day du) tro toi Postgres managed ben ngoai - hien tai la Neon.
// Fallback sang cac bien DB_HOST/DB_PORT/... rieng le cho Postgres cai tai cho.
const connectionString = process.env.DATABASE_URL;

// Quy tac SSL - GIONG HET db/init.js de hai noi khong bao gio lech nhau:
//   - Co DATABASE_URL  -> BAT SSL (Neon/Railway/Aiven/Supabase deu bat buoc ma hoa),
//                         tru khi ep DB_SSL=false.
//   - Khong co          -> TAT SSL (Postgres cai tai cho), tru khi ep DB_SSL=true.
// Truoc day file nay chi bat SSL khi DB_SSL === 'true' con init.js thi tu bat theo
// DATABASE_URL - lech nhau khien "npm run db:init" chay duoc nhung server that lai chet
// voi loi ECONNRESET. Da thong nhat lai.
const forcedSsl = String(process.env.DB_SSL || '').toLowerCase();
const sslEnabled = connectionString ? forcedSsl !== 'false' : forcedSsl === 'true';
// rejectUnauthorized: false vi cac nha cung cap managed dung chung chi noi bo tu ky.
const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

// Tham so chung cho ca 2 kieu cau hinh. Nhung gia tri nay danh rieng cho Postgres "serverless"
// kieu Neon (compute tu ngu khi khong ai dung, ket noi di qua lop proxy trung gian):
//   keepAlive            - gui goi tin giu nhip TCP, chong bi proxy/NAT cat ket noi im lang.
//   connectionTimeoutMillis - Neon dang ngu can vai giay de thuc day; mac dinh cua `pg` la cho
//                          vo han, treo im lim khong bao gio bao loi. 20s la du rong.
//   idleTimeoutMillis    - tu dong tra ket noi nhan roi ve, ngan hon nguong cat cua Neon.
const POOL_TUNING = {
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  max: Number(process.env.DB_POOL_MAX || 10)
};

const rawPool = connectionString
  ? new Pool({ connectionString, ssl: sslConfig, ...POOL_TUNING })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'smart_queue',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: sslConfig,
      ...POOL_TUNING
    });

// BAT BUOC phai co voi Neon: Neon tu dua compute ve trang thai ngu khi khong co truy van
// (scale-to-zero) va ngat cac ket noi dang nhan roi trong pool. Khi do thu vien `pg` phat
// su kien 'error' tren pool; neu KHONG co ham lang nghe nay, Node coi la loi khong ai bat
// va GIET CA TIEN TRINH - server tu sap sau vai phut khong ai dung, dung luc dem hom hoac
// dung luc dang demo. Bat lay, ghi log, de pool tu mo ket noi moi o truy van ke tiep.
rawPool.on('error', (err) => {
  console.error('[db] Ket noi nhan roi bi ngat (binh thuong khi Neon ngu):', err.message);
});

// Nhan dien loi "ket noi dut giua chung" - KHAC voi loi nghiep vu (trung khoa, sai kieu...).
// Chi nhung loi nay moi duoc thu lai; loi nghiep vu phai nem ra ngay cho goi xu ly.
// Hay gap voi Neon: compute vua thuc day sau khi ngu, hoac proxy cat ket noi nhan roi.
const TRANSIENT_CODES = new Set([
  'ECONNRESET',   // may chu dong ket noi dot ngot
  'EPIPE',        // ghi vao ket noi da dong
  'ETIMEDOUT',    // het thoi gian cho mang
  'ENOTFOUND',    // DNS chua phan giai kip luc Neon dang thuc day
  '57P01',        // admin_shutdown - Postgres chu dong ngat phien
  '57P02',        // crash_shutdown
  '08006',        // connection_failure
  '08003',        // connection_does_not_exist
  '08001'         // sqlclient_unable_to_establish_sqlconnection
]);

function isTransient(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const m = String(err.message || '');
  return m.includes('Connection terminated') || m.includes('connection timeout')
      || m.includes('server closed the connection') || m.includes('Client has encountered a connection error');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Adapter: chuan hoa ket qua ve dang { rows } (pg tra thang { rows, rowCount, ... } roi,
// nhung van giu wrapper de repositories/services dung chung 1 cach goi
// `const { rows } = await client.query(sql, params)` bat ke driver ben duoi la gi).
//
// retries: CHI bat cho truy van di thang qua pool (moi cau la 1 don vi doc lap, chay lai
// vo hai). TUYET DOI khong bat cho client trong transaction: ket noi dut la ca transaction
// da bi ROLLBACK, chay lai 1 cau le giua chung se ghi du lieu sai lech - phai chay lai ca
// khoi transaction thi moi dung (xem withTransaction ben duoi).
function wrapQueryable(executor, { retries = 0 } = {}) {
  return {
    query: async (sql, params) => {
      const text = toPgPlaceholders(sql);
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await executor.query(text, params);
          return { rows: result.rows || [], raw: result };
        } catch (err) {
          lastErr = err;
          if (attempt === retries || !isTransient(err)) throw err;
          const waitMs = 400 * Math.pow(2, attempt); // 400ms -> 800ms -> 1600ms
          console.warn(`[db] Ket noi dut (${err.code || err.message}); thu lai lan ${attempt + 1}/${retries} sau ${waitMs}ms...`);
          await sleep(waitMs);
        }
      }
      throw lastErr;
    }
  };
}

const pool = wrapQueryable(rawPool, { retries: 3 });

// Chay 1 khoi lenh trong 1 transaction, tu dong ROLLBACK neu loi.
// Dung cho moi thao tac thay doi trang thai ve de trach Race Condition (SELECT ... FOR UPDATE).
// LO HONG CUA THU VIEN `pg` - da kiem chung bang thuc nghiem:
// rawPool.on('error') CHI bat loi cua ket noi dang NAM ROI trong pool. Ngay khi 1 ket noi
// duoc lay ra dung (pool.connect()), pg-pool GO BO ham lang nghe loi cua no. Neu luc do may
// chu cat ket noi (Neon thuc day sau khi ngu, proxy ngat...), doi tuong Client phat su kien
// 'error' ma KHONG AI NGHE -> Node giet ca tien trinh. Nghia la: chi can 1 lan dut mang dung
// luc dang xu ly 1 ve la CA SERVER SAP, khong phai chi hong 1 giao dich.
// Khac phuc: gan vinh vien 1 ham lang nghe cho moi ket noi vat ly, danh dau bang Symbol de
// khong gan trung khi ket noi do duoc tai su dung (tranh canh bao MaxListenersExceeded).
const HAS_ERROR_HANDLER = Symbol('hasErrorHandler');
function ensureClientErrorHandler(conn) {
  if (conn[HAS_ERROR_HANDLER]) return;
  conn[HAS_ERROR_HANDLER] = true;
  conn.on('error', (err) => {
    console.error('[db] Ket noi dang su dung bi ngat:', err.message);
  });
}

async function runTransactionOnce(fn) {
  const conn = await rawPool.connect();
  ensureClientErrorHandler(conn);
  let failed = false;
  try {
    await conn.query('BEGIN');
    // retries = 0: bên trong transaction KHONG duoc thu lai tung cau le (xem wrapQueryable).
    const result = await fn(wrapQueryable(conn));
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    failed = true;
    // ROLLBACK tren 1 ket noi da dut se nem tiep 1 loi khac va NUOT MAT loi goc - luc do
    // nguoi doc log chi thay "Connection terminated" thay vi nguyen nhan that (VD trung khoa).
    // Bat rieng, bo qua, va nem lai dung loi ban dau.
    try { await conn.query('ROLLBACK'); } catch (_) { /* ket noi da hong, khong con gi de rollback */ }
    throw err;
  } finally {
    // Truyen error vao release() de `pg` HUY han ket noi hong thay vi tra no ve pool cho
    // luot sau dung lai (ket noi da dut ma tra lai pool se lam hong luon truy van ke tiep).
    conn.release(failed ? true : undefined);
  }
}

// Ket noi toi Neon co the dut giua chung (compute vua thuc day sau khi ngu, proxy cat ket noi).
// Khi do transaction da bi ROLLBACK sach - chay lai TOAN BO khoi la an toan va dung dan.
// Chi thu lai voi loi ket noi; loi nghiep vu (trung khoa, sai trang thai ve...) nem ra ngay.
async function withTransaction(fn, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runTransactionOnce(fn);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      const waitMs = 400 * Math.pow(2, attempt);
      console.warn(`[db] Transaction dut ket noi (${err.code || err.message}); chay lai ca khoi, lan ${attempt + 1}/${retries} sau ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

module.exports = { pool, withTransaction };
