const mysql = require('mysql2/promise');

const rawPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'smart_queue',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 20,
  decimalNumbers: true, // tra ve DECIMAL nhu number thay vi string (fee_amount, min_bound...)
  charset: 'utf8mb4' // bat buoc: mac dinh mysql2 khong dung utf8mb4 => chu co dau bi vo thanh '?'
});

// Adapter: bao mysql2 (tra ve [rows, fields]) thanh dang { rows } giong pg,
// de repositories/services dung chung 1 cach goi `const { rows } = await client.query(sql, params)`.
function wrapQueryable(executor) {
  return {
    query: async (sql, params) => {
      const [result] = await executor.query(sql, params);
      return { rows: Array.isArray(result) ? result : [], raw: result };
    }
  };
}

const pool = wrapQueryable(rawPool);

// Chay 1 khoi lenh trong 1 transaction, tu dong ROLLBACK neu loi.
// Dung cho moi thao tac thay doi trang thai ve de trach Race Condition (SELECT ... FOR UPDATE).
async function withTransaction(fn) {
  const conn = await rawPool.getConnection();
  try {
    await conn.beginTransaction();
    const client = wrapQueryable(conn);
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
