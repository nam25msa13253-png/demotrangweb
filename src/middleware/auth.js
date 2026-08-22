const authService = require('../services/authService');

// Bam sat Ma tran RBAC (muc 4.1 tai lieu Admin): nhom quyen theo vai tro.
const PERMISSION_GROUPS = {
  MONITOR: ['SUPER_ADMIN', 'MANAGER', 'SUPERVISOR'],           // Giam sat Realtime
  DISPATCH: ['SUPER_ADMIN', 'MANAGER', 'SUPERVISOR'],          // San tai / Doi Quay
  CONFIG: ['SUPER_ADMIN'],                                     // Cau hinh Tham so
  PRIORITY_RESTORE: ['SUPER_ADMIN', 'MANAGER', 'SUPERVISOR'],  // Khoi phuc / VIP
  REPORTS: ['SUPER_ADMIN', 'MANAGER'],                         // Xem Bao cao / Audit
  COUNTER_OPS: ['SUPER_ADMIN', 'OFFICER'],                     // Van hanh quay (Officer chi xem quay minh)
  STAFF_MANAGEMENT: ['SUPER_ADMIN']                            // Quan ly Tai khoan Can bo
};

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Thieu token xac thuc.' });

  try {
    // Express 4 khong tu bat Promise reject tu middleware async - phai try/catch thu cong,
    // neu khong loi DB se lam request treo vo han thay vi tra ve loi ro rang.
    const session = await authService.verifyToken(token);
    if (!session) return res.status(401).json({ error: 'Token khong hop le hoac da het han.' });
    req.staff = session;
    next();
  } catch (err) {
    next(err);
  }
}

function requirePermission(groupName) {
  const allowedRoles = PERMISSION_GROUPS[groupName];
  if (!allowedRoles) throw new Error(`Nhom quyen khong ton tai: ${groupName}`);
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'Chua xac thuc.' });
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: `Vai tro ${req.staff.role} khong co quyen thuc hien thao tac nay.` });
    }
    next();
  };
}

module.exports = { authenticate, requirePermission, PERMISSION_GROUPS };
