const { pool } = require('./db');

// Cache trong bo nho cho Dynamic Policy & Business Rules Engine.
// Duoc nap lai moi khi Admin cap nhat tham so (xem routes/adminRoutes.js).
let cache = null;

async function loadAll() {
  const { rows } = await pool.query('SELECT * FROM system_configs');
  cache = {};
  for (const row of rows) {
    cache[row.config_key] = row;
  }
  return cache;
}

async function get(key) {
  if (!cache) await loadAll();
  const row = cache[key];
  if (!row) throw new Error(`Tham so cau hinh khong ton tai: ${key}`);
  if (row.value_type === 'NUMBER') return Number(row.config_value);
  if (row.value_type === 'BOOLEAN') return row.config_value === 'true';
  if (row.value_type === 'JSON') return JSON.parse(row.config_value);
  return row.config_value;
}

async function getAll() {
  if (!cache) await loadAll();
  return cache;
}

// Rang buoc cho cac tham so kieu chuoi co dinh dang rieng (gio mo cua Kiosk...): ngan Admin nhap
// gia tri sai (VD "25:99") lam hong logic gio mo cua. Ham nhan (value, cache) va nem loi neu sai.
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
function toMinutes(v) { const m = TIME_PATTERN.exec(String(v).trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
const STRING_VALIDATORS = {
  KIOSK_OPEN_TIME(value, c) {
    if (toMinutes(value) === null) throw new Error('Gio mo cua phai co dang HH:MM (VD 07:30).');
    const close = c.KIOSK_CLOSE_TIME && toMinutes(c.KIOSK_CLOSE_TIME.config_value);
    if (close !== null && close !== undefined && toMinutes(value) >= close) throw new Error('Gio mo cua phai som hon gio dong cua hien tai.');
  },
  KIOSK_CLOSE_TIME(value, c) {
    if (toMinutes(value) === null) throw new Error('Gio dong cua phai co dang HH:MM (VD 17:00).');
    const open = c.KIOSK_OPEN_TIME && toMinutes(c.KIOSK_OPEN_TIME.config_value);
    if (open !== null && open !== undefined && toMinutes(value) <= open) throw new Error('Gio dong cua phai muon hon gio mo cua hien tai.');
  },
  KIOSK_WORKING_DAYS(value) {
    const days = String(value).split(',').map((s) => s.trim());
    if (!days.length || days.some((d) => !/^[1-7]$/.test(d))) {
      throw new Error('Ngay lam viec phai la danh sach so tu 1 (Thu Hai) den 7 (Chu nhat), cach nhau bang dau phay. VD: 1,2,3,4,5');
    }
  },
  WIFI_SECURITY(value) {
    if (!['WPA', 'WEP', 'nopass'].includes(String(value).trim())) throw new Error('Kieu bao mat Wi-Fi chi nhan: WPA, WEP hoac nopass.');
  }
};

// Safe Limits Validation: ap dung rang buoc cung (Hard bounds) truoc khi luu.
async function set(key, value, updatedBy) {
  if (!cache) await loadAll();
  const row = cache[key];
  if (!row) throw new Error(`Tham so cau hinh khong ton tai: ${key}`);

  if (row.value_type === 'NUMBER') {
    const num = Number(value);
    if (Number.isNaN(num)) throw new Error(`Gia tri "${value}" khong phai la so hop le.`);
    if (row.min_bound !== null && num < Number(row.min_bound)) {
      throw new Error(`Gia tri ${num} nho hon bien do toi thieu cho phep (${row.min_bound}) cua ${key}.`);
    }
    if (row.max_bound !== null && num > Number(row.max_bound)) {
      throw new Error(`Gia tri ${num} vuot bien do toi da cho phep (${row.max_bound}) cua ${key}.`);
    }
  }

  if (STRING_VALIDATORS[key]) STRING_VALIDATORS[key](value, cache);

  await pool.query(
    'UPDATE system_configs SET config_value = ?, updated_by = ? WHERE config_key = ?',
    [String(value), updatedBy || null, key]
  );
  await loadAll();
  return cache[key];
}

module.exports = { get, getAll, set, loadAll };
