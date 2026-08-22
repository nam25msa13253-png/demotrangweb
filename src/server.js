require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const wsHub = require('./websocket/wsHub');
const configService = require('./config/configService');
const purgeScheduler = require('./services/purgeScheduler');
const runMigrations = require('./migrations/runMigrations');
const authService = require('./services/authService');

const authRoutes = require('./routes/authRoutes');
const kioskRoutes = require('./routes/kioskRoutes');
const counterRoutes = require('./routes/counterRoutes');
const adminRoutes = require('./routes/adminRoutes');
const displayRoutes = require('./routes/displayRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

// ĐỔI TÊN MIỀN Ở ĐÂY: chỉ cần sửa danh sách này rồi git push - Render tự deploy lại,
// không cần vào Render Dashboard cấu hình gì thêm.
//
// Lưu ý: vì trang tĩnh (public/) và API cùng được phục vụ từ CHÍNH server này (dòng
// app.use(express.static(...)) bên dưới), request từ các trang Kiosk/Admin/Counter khi mở
// đúng domain là SAME-ORIGIN nên KHÔNG bị CORS chặn dù danh sách này có gì - danh sách này
// chỉ chặn các trang WEB KHÁC (domain lạ) gọi thẳng vào API công khai (chống scraping/tích
// hợp trái phép), không làm thay đổi trải nghiệm sử dụng bình thường của chính hệ thống.
const ALLOWED_ORIGINS = [
  'https://smart-queue-system-akpr.onrender.com',
  'http://localhost:3000'
];

const app = express();
app.use(helmet({
  // Tat Content-Security-Policy mac dinh cua helmet: nhieu trang trong public/ (index.html,
  // kiosk.html...) dung <script> inline ngay trong HTML, neu bat CSP mac dinh (chi cho phep
  // script tu 'self') se chan luon cac script inline nay va lam hong toan bo trang. Cac
  // header bao mat khac (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security...)
  // van duoc bat binh thuong.
  contentSecurityPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    // Khong co Origin header (goi truc tiep bang curl/Postman, health check cua Render...)
    // van duoc cho qua - CORS von chi ap dung cho request tu trinh duyet.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: Nguon goc (origin) nay khong duoc phep truy cap API.'));
  }
}));
app.use(express.json());

// Chong brute-force dang nhap: toi da 10 lan thu/15 phut cho moi IP tren dung route dang
// nhap (khong anh huong cac API khac). Dat truoc authRoutes vi authRoutes mount o /api/auth.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ban thu dang nhap qua nhieu lan, vui long thu lai sau it phut.' }
});
app.use('/api/auth/login', loginLimiter);

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
    authService.startExpiredSessionCleanup();
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
