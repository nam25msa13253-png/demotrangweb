require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const wsHub = require('./websocket/wsHub');
const configService = require('./config/configService');
const purgeScheduler = require('./services/purgeScheduler');
const runMigrations = require('./migrations/runMigrations');

const authRoutes = require('./routes/authRoutes');
const kioskRoutes = require('./routes/kioskRoutes');
const counterRoutes = require('./routes/counterRoutes');
const adminRoutes = require('./routes/adminRoutes');
const displayRoutes = require('./routes/displayRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

// Danh sach domain duoc phep goi API tu trinh duyet (CORS). Doc tu bien moi truong
// CORS_ORIGIN (nhieu domain cach nhau boi dau phay, VD khi doi ten mien: dat
// CORS_ORIGIN=https://ten-mien-moi.com tren Render Dashboard -> Environment, KHONG can sua
// code/deploy lai). Neu chua dat bien nay, fallback ve domain Render mac dinh hien tai.
//
// Luu y: vi trang tinh (public/) va API cung duoc phuc vu tu CHINH server nay (dong 37 ben
// duoi), request tu cac trang Kiosk/Admin/Counter khi mo dung domain la SAME-ORIGIN nen KHONG
// bi CORS chan du co cau hinh gi - danh sach nay chi chan cac trang WEB KHAC (domain la) goi
// thang vao API cong khai (chong scraping/tich hop trai phep), khong lam thay doi trai
// nghiem su dung binh thuong cua chinh he thong.
const DEFAULT_ALLOWED_ORIGINS = ['https://smart-queue-system-akpr.onrender.com', 'http://localhost:3000'];
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

const app = express();
app.use(cors({
  origin(origin, callback) {
    // Khong co Origin header (goi truc tiep bang curl/Postman, health check cua Render...)
    // van duoc cho qua - CORS von chi ap dung cho request tu trinh duyet.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS: Nguon goc (origin) nay khong duoc phep truy cap API.'));
  }
}));
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

// Render (va cac PaaS khac) tu gan cong qua bien PORT - phai uu tien no truoc SERVER_PORT.
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

runMigrations.run()
  .then(() => configService.loadAll())
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
    console.error('Khong the khoi dong server (loi migrate/nap cau hinh he thong tu DB):', err);
    process.exit(1);
  });
