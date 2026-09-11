const express = require('express');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thieu username/password.' });
    const result = await authService.login(username, password, req.ip);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Tu doi mat khau (yeu cau da dang nhap) - dung cho man "Doi mat khau" va cho buoc bat buoc
// doi mat khau mac dinh/mat khau Admin vua cap (mustChangePassword = true tu /login).
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Thieu mat khau hien tai hoac mat khau moi.' });
    await authService.changePassword(req.staff.staffId, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) await authService.logout(token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
