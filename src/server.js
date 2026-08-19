require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const wsHub = require('./websocket/wsHub');
const configService = require('./config/configService');
const purgeScheduler = require('./services/purgeScheduler');

const authRoutes = require('./routes/authRoutes');
const kioskRoutes = require('./routes/kioskRoutes');
const counterRoutes = require('./routes/counterRoutes');
const adminRoutes = require('./routes/adminRoutes');
const displayRoutes = require('./routes/displayRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Luu y thu tu: cac prefix CU THE hon (/api/auth, /api/kiosk, /api/admin, /api/display,
// /api/health) phai duoc dang ky TRUOC '/api' (counterRoutes) - Express khop app.use()
// theo tien to va theo dung thu tu dang ky, nen neu counterRoutes (mount o '/api' tran)
// dung truoc, no se "nuot" luon ca /api/admin/*, /api/display/*, /api/health vi cung bat
// dau bang '/api', roi middleware authenticate() cua no chan luon nhung route khac.
app.use('/api/auth', authRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api', counterRoutes);       // /api/counters, /api/tickets/:id/* - dang ky SAU CUNG

// Frontend tinh (Kiosk / Counter / Display / Admin)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Loi he thong noi bo.' });
});

const server = http.createServer(app);
wsHub.init(server); // WebSocket tich hop chung port voi HTTP server

const PORT = process.env.SERVER_PORT || 3000;

configService.loadAll()
  .then(() => {
    purgeScheduler.start();
    server.listen(PORT, () => {
      console.log(`Smart Queue System dang chay tai http://localhost:${PORT}`);
      console.log(`  - Kiosk:   http://localhost:${PORT}/kiosk.html`);
      console.log(`  - Counter: http://localhost:${PORT}/counter.html`);
      console.log(`  - Display: http://localhost:${PORT}/display.html`);
      console.log(`  - Admin:   http://localhost:${PORT}/admin.html`);
    });
  })
  .catch((err) => {
    console.error('Khong the khoi dong server (loi nap cau hinh he thong tu DB):', err);
    process.exit(1);
  });
