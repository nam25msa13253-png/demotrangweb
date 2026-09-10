// Validate input toi thieu, dung chung cho cac route nhan tham so tu request cua nguoi dung
// (kem ca Kiosk cong khai, khong dang nhap) - muc dich la chan SOM cac gia tri ro rang sai
// dinh dang (thieu, khong phai so...) truoc khi cham toi tang DB, tranh loi Postgres tho
// (VD "invalid input syntax for type integer") bi lo ra ngoai nguyen van qua res.json({error}).
// Khong dung thu vien ngoai (Joi/Zod) vi chi can vai truong hop don gian, them dependency moi
// khong dang cho pham vi nay.

class ValidationError extends Error {}

// So nguyen duong (id cua ban ghi trong DB deu la id tu tang hoac > 0) - tra ve so da ep kieu.
function requireInt(value, fieldLabel) {
  const num = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isInteger(num) || num <= 0) {
    throw new ValidationError(`${fieldLabel} phai la so nguyen duong hop le.`);
  }
  return num;
}

// Chuoi khong rong sau khi trim - dung cho ten/ma/... bat buoc nhap.
function requireString(value, fieldLabel) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldLabel} khong duoc de trong.`);
  }
  return value.trim();
}

module.exports = { ValidationError, requireInt, requireString };
