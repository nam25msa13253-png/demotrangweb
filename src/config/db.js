const { Pool } = require('pg');

// Chuyen placeholder kieu MySQL (?) sang kieu Postgres ($1, $2, ...) de toan bo
// repositories/services giu nguyen cach viet SQL cu, khong phai sua tung cau.
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Render Blueprint (render.yaml) tu wire DATABASE_URL khi khai bao `fromDatabase` cho
// Postgres managed - uu tien dung thang connection string nay neu co. Fallback sang cac
// bien DB_HOST/DB_PORT/... rieng le cho moi truong khac (Railway, Aiven, Postgres local...).
const connectionString = process.env.DATABASE_URL;
const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

const rawPool = connectionString
  ? new Pool({ connectionString, ssl: sslConfig })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'smart_queue',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: sslConfig
    });

// Adapter: chuan hoa ket qua ve dang { rows } (pg tra thang { rows, rowCount, ... } roi,
// nhung van giu wrapper de repositories/services dung chung 1 cach goi
// `const { rows } = await client.query(sql, params)` bat ke driver ben duoi la gi).
function wrapQueryable(executor) {
  return {
    query: async (sql, params) => {
      const result = await executor.query(toPgPlaceholders(sql), params);
      return { rows: result.rows || [], raw: result };
    }
  };
}

const pool = wrapQueryable(rawPool);

// Chay 1 khoi lenh trong 1 transaction, tu dong ROLLBACK neu loi.
// Dung cho moi thao tac thay doi trang thai ve de trach Race Condition (SELECT ... FOR UPDATE).
async function withTransaction(fn) {
  const conn = await rawPool.connect();
  try {
    await conn.query('BEGIN');
    const client = wrapQueryable(conn);
    const result = await fn(client);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
