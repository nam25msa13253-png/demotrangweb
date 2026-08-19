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

  await pool.query(
    'UPDATE system_configs SET config_value = ?, updated_by = ? WHERE config_key = ?',
    [String(value), updatedBy || null, key]
  );
  await loadAll();
  return cache[key];
}

module.exports = { get, getAll, set, loadAll };
