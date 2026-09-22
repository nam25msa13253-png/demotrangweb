require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// ---------------------------------------------------------------------------------------
// Khoi tao / nang cap schema Postgres.
//
//   npm run db:init                                  -> chay db/schema.sql (mac dinh)
//   node db/init.js db/migrations/001_upgrade.sql     -> chay 1 file .sql bat ky
//
// Khac MySQL: Postgres managed (Render/Railway/Aiven/Neon/Supabase) da tao san 1 database
// rieng, user ung dung thuong khong co quyen DROP/CREATE DATABASE - nen script nay chay
// thang vao database da duoc cap, khong co DROP/CREATE DATABASE + USE nhu ban MySQL cu.
// ---------------------------------------------------------------------------------------

// DATABASE_URL (connection string day du) hau nhu luon tro toi Postgres managed ngoai - cac
// host nay BAT BUOC SSL, nen mac dinh BAT SSL khi co DATABASE_URL (tru khi ep DB_SSL=false).
// Nguoc lai, khi dung cac bien DB_HOST/... roi (thuong la Postgres cai tai cho) thi mac dinh
// TAT SSL (tru khi ep DB_SSL=true). Thieu buoc nay se bi ECONNRESET vi server tu ngat ket noi
// khong ma hoa.
// Luu y: URL noi bo cua Render (postgres://...-a/dbname, khong co duoi .render.com) chay trong
// mang rieng va KHONG dung SSL - truong hop do dat DB_SSL=false.
function buildSslConfig() {
  const forced = String(process.env.DB_SSL || '').toLowerCase();
  const enabled = process.env.DATABASE_URL ? forced !== 'false' : forced === 'true';
  // rejectUnauthorized: false vi cac nha cung cap managed dung chung chi tu ky cho ket noi
  // noi bo; muon kiem tra chung chi that thi dat DB_SSL_CA tro toi file CA.
  if (!enabled) return false;
  if (process.env.DB_SSL_CA && fs.existsSync(process.env.DB_SSL_CA)) {
    return { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

function createClient() {
  const ssl = buildSslConfig();
  return process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL, ssl })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'smart_queue',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl
      });
}

// File migration co san BEGIN;/COMMIT; ben trong. Script nay tu bao ca file trong 1 giao dich
// roi, nen go bo 2 lenh do de khong bi canh bao "there is already a transaction in progress".
//
// Phai rat can than: BEGIN/END cung la tu khoa mo/dong than ham PL/pgSQL ($$ BEGIN ... END; $$)
// - go nham la hong ham set_updated_at. Vi vay:
//   - BEGIN; chi duoc go trong phan van ban NAM TRUOC khoi dollar-quote dau tien ($$ hay $tag$),
//   - COMMIT; go o bat ky dau (tu khoa nay khong bao gio xuat hien trong than ham cua du an),
//   - END; tuyet doi khong dung toi.
function stripOuterTransaction(sql) {
  const firstDollar = sql.search(/\$[A-Za-z_0-9]*\$/);
  const head = firstDollar === -1 ? sql : sql.slice(0, firstDollar);
  const tail = firstDollar === -1 ? '' : sql.slice(firstDollar);
  const cleanedHead = head.replace(/^[ \t]*BEGIN[ \t]*;[ \t]*$/gim, '');
  return (cleanedHead + tail).replace(/^[ \t]*COMMIT[ \t]*;[ \t]*$/gim, '');
}

// Postgres tra ve vi tri ky tu gay loi trong chuoi SQL - doi sang so dong de bao loi cho nguoi dung.
function describeError(err, sql) {
  if (!err.position) return '';
  const upto = sql.slice(0, Number(err.position));
  const line = upto.split('\n').length;
  const snippet = sql.split('\n')[line - 1] || '';
  return `\n  Tai dong ${line}: ${snippet.trim()}`;
}

async function main() {
  const target = process.argv[2] || path.join(__dirname, 'schema.sql');
  const file = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  if (!fs.existsSync(file)) {
    throw new Error(`Khong tim thay file SQL: ${file}`);
  }

  const sql = stripOuterTransaction(fs.readFileSync(file, 'utf8'));
  const client = createClient();

  await client.connect();
  // In cac thong bao NOTICE cua Postgres (VD "relation ... already exists, skipping") de
  // nguoi chay thay ro buoc nao duoc bo qua khi chay lai.
  client.on('notice', (msg) => console.log(`  [postgres] ${msg.message}`));

  try {
    console.log(`Dang ap dung: ${path.relative(process.cwd(), file)}`);
    // Toan bo file chay trong 1 giao dich: co loi la ROLLBACK sach, database khong bi nua voi.
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Hoan tat. Schema da duoc ap dung thanh cong.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    err.message += describeError(err, sql);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Loi khoi tao database:', err.message);
  if (err.detail) console.error('  Chi tiet:', err.detail);
  if (err.hint) console.error('  Goi y:', err.hint);
  process.exit(1);
});
