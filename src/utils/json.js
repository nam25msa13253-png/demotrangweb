// MariaDB luu cot JSON thuc chat la LONGTEXT (co CHECK rang buoc), nen driver mysql2
// KHONG tu dong parse thanh object/array nhu pg lam voi JSONB. Phai parse thu cong.
function parseJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value; // da la object/array san roi thi giu nguyen
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

module.exports = { parseJson };
