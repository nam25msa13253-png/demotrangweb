// Chinh sach mat khau dung chung cho moi noi TAO/DAT LAI mat khau (khong anh huong mat khau
// CU da luu - tai khoan cu van dang nhap binh thuong, chinh sach nay chi ap dung khi 1 mat
// khau MOI dang duoc thiet lap tu gio tro di).
const MIN_LENGTH = 8;

// Bcrypt cost factor cho MOI hash MOI tu gio (truoc day la 10). Tang len 12 khong lam hong
// mat khau cu: hash bcrypt tu chua so vong lap dung de tao ra no, bcrypt.compare() doc lai
// dung so vong do bat ke cau hinh hien tai la bao nhieu - nen tai khoan cu (hash cost 10) van
// dang nhap binh thuong, chi mat khau MOI duoc tao tu gio se dung cost 12 (an toan hon).
const BCRYPT_COST = 12;

function validatePassword(password) {
  if (!password || password.length < MIN_LENGTH) {
    throw new Error(`Mat khau can toi thieu ${MIN_LENGTH} ky tu.`);
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Mat khau can co ca chu va so.');
  }
}

module.exports = { validatePassword, MIN_LENGTH, BCRYPT_COST };
