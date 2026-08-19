require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  // DATABASE_URL (connection string day du) hau nhu luon tro toi Postgres managed ngoai
  // (Render External URL, Railway, Aiven, Neon, Supabase...) - cac host nay BAT BUOC SSL,
  // nen mac dinh BAT SSL khi co DATABASE_URL (tru khi ep DB_SSL=false). Nguoc lai, khi dung
  // cac bien DB_HOST/... roi (thuong la Postgres local/XAMPP-style) thi mac dinh TAT SSL
  // (tru khi ep DB_SSL=true). Thieu buoc nay se bi ECONNRESET vi server tu ngat ket noi
  // khong ma hoa.
  const sslEnabled = process.env.DATABASE_URL
    ? String(process.env.DB_SSL || '').toLowerCase() !== 'false'
    : String(process.env.DB_SSL || '').toLowerCase() === 'true';
  const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

  // Khac MySQL: Postgres (nhat la ban managed nhu Render/Railway/Aiven) da tao san 1
  // database rieng cho ban, user thuong khong co quyen DROP/CREATE DATABASE - nen script
  // nay chi chay CREATE TABLE/INSERT thang vao database da duoc cap (khong con DROP/CREATE
  // DATABASE + USE nhu ban MySQL cu).
  const client = process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfig })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'smart_queue',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: sslConfig
      });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await client.connect();
  try {
    console.log('Dang khoi tao schema...');
    await client.query(sql);
    console.log('Khoi tao schema thanh cong.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Loi khoi tao database:', err);
  process.exit(1);
});
