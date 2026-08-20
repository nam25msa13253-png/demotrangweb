const bcrypt = require('bcryptjs');
const { withTransaction } = require('../config/db');
const staffRepo = require('../repositories/staffRepository');
const auditRepo = require('../repositories/auditRepository');
const { newId } = require('../utils/uuid');

// Admin (SUPER_ADMIN) chi duoc tao tai khoan cho 3 vai tro van hanh nay qua man Quan ly Tai
// khoan - SUPER_ADMIN khac duoc khoi tao san trong db/schema.sql (seed data), khong tao them qua UI.
const MANAGEABLE_ROLES = ['MANAGER', 'SUPERVISOR', 'OFFICER'];

async function listStaff() {
  return withTransaction((client) => staffRepo.listAll(client));
}

async function createStaff({ fullName, username, password, role }, adminId) {
  if (!fullName || !username || !password || !role) throw new Error('Vui long nhap day du ho ten, ten dang nhap, mat khau va vai tro.');
  if (!MANAGEABLE_ROLES.includes(role)) throw new Error('Vai tro khong hop le.');
  if (password.length < 6) throw new Error('Mat khau can toi thieu 6 ky tu.');

  return withTransaction(async (client) => {
    const existing = await staffRepo.findByUsername(client, username.trim());
    if (existing) throw new Error('Ten dang nhap da ton tai.');

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await staffRepo.create(client, {
      id: newId(), fullName: fullName.trim(), username: username.trim(), passwordHash, role
    });
    await auditRepo.insertLog(client, {
      adminId, action: 'STAFF_CREATED', targetType: 'STAFF', targetId: created.id,
      reason: `Tao tai khoan ${role}`, payload: { username: created.username, role }
    });
    return created;
  });
}

// Khoa/Mo tai khoan thay vi xoa - bao toan tham chieu Audit Trail / lich su quay / ve da xu ly.
async function setStaffActive(staffId, isActive, adminId) {
  return withTransaction(async (client) => {
    const target = await staffRepo.findById(client, staffId);
    if (!target) throw new Error('Tai khoan khong ton tai.');
    if (target.role === 'SUPER_ADMIN') throw new Error('Khong the khoa tai khoan Super Admin.');

    const updated = await staffRepo.updateActive(client, staffId, isActive);
    await auditRepo.insertLog(client, {
      adminId, action: isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED', targetType: 'STAFF', targetId: staffId,
      reason: isActive ? 'Kich hoat lai tai khoan' : 'Khoa tai khoan'
    });
    return updated;
  });
}

async function resetStaffPassword(staffId, newPassword, adminId) {
  if (!newPassword || newPassword.length < 6) throw new Error('Mat khau can toi thieu 6 ky tu.');
  return withTransaction(async (client) => {
    const target = await staffRepo.findById(client, staffId);
    if (!target) throw new Error('Tai khoan khong ton tai.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await staffRepo.updatePassword(client, staffId, passwordHash);
    await auditRepo.insertLog(client, {
      adminId, action: 'STAFF_PASSWORD_RESET', targetType: 'STAFF', targetId: staffId, reason: 'Dat lai mat khau'
    });
  });
}

module.exports = { listStaff, createStaff, setStaffActive, resetStaffPassword };
