const crypto = require('crypto');

// MariaDB 10.4 (XAMPP) khong co kieu UUID/DEFAULT expression on cho CHAR(36),
// nen id duoc sinh o phia ung dung truoc khi INSERT.
function newId() {
  return crypto.randomUUID();
}

module.exports = { newId };
