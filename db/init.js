require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  // Khong chi dinh `database` o day vi schema.sql tu CREATE DATABASE + USE.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4' // bat buoc: mac dinh mysql2 khong dung utf8mb4 => seed data tieng Viet bi vo dau
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    console.log('Dang khoi tao schema...');
    await connection.query(sql);
    console.log('Khoi tao schema thanh cong.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Loi khoi tao database:', err);
  process.exit(1);
});
