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
// Render (va moi PaaS dung reverse proxy) dat request qua 1 proxy noi bo - neu khong khai bao
// dong nay, req.ip va express-rate-limit deu doc nham IP cua proxy (giong nhau cho MOI nguoi
// dung) thay vi IP that cua trinh duyet, khien gioi han dang nhap theo IP (loginLimiter ben
// duoi) va log dang nhap sai (authService.login) vo nghia. `1` = tin 1 tang proxy ngay truoc
// server (dung voi ha tang cua Render).
app.set('trust proxy', 1);
app.use(helmet({
  // Bat CSP voi script-src chi cho 'self' + CDN duy nhat dang dung (cdnjs, de tai thu vien
  // qrcodejs trong chatbot.js). Truoc day CSP bi tat hoan toan vi cac trang public/ dung
  // <script> inline va onclick="..." rai rac (CSP coi ca 2 la "inline script" va chan tuyet
  // doi) - toan bo da duoc chuyen sang file .js rieng + data-action/actionDelegate.js (event
  // delegation) nen gio bat lai duoc ma khong hong trang nao. script-src-attr mac dinh cua
  // helmet la 'none' (chan hoan toan onclick=...), dung y muon - khong can noi long.
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
      // Dich vu Wi-Fi cuc bo tren may Kiosk (wifi-local-service, cong 5000) - trinh duyet goi thang
      // vao do de doc mang Wi-Fi THAT. Truoc day thieu dong nay nen CSP (default-src 'self') chan
      // hoan toan cac loi goi nay: the QR Wi-Fi tu may Kiosk chua bao gio hien duoc tren ban chay that.
      'connect-src': ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000']
    }
  }
}));
// Trinh duyet GUI header Origin ca voi request POST/PUT CUNG NGUON (trang tinh va API cung 1
// server), nen "same-origin khong bi CORS chan" chi dung khi Origin nam trong ALLOWED_ORIGINS.
// Truoc day chay o cong khac (VD 3100) hoac mo Kiosk qua IP mang LAN (http://192.168.x.x:3000)
// thi moi thao tac ghi (lay so, dang nhap...) deu bi chan voi loi 500. Cho qua them moi Origin
// co CUNG host voi header Host cua chinh request nay (cung nguon that su), va tra 403 ro rang
// (thay vi 500) cho nguon la.
function isSameHostOrigin(req, origin) {
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin) || isSameHostOrigin(req, origin)) return next();
  res.status(403).json({ error: 'CORS: Nguon goc (origin) nay khong duoc phep truy cap API.' });
});
// Khong co Origin header (curl/Postman, health check cua Render...) van duoc cho qua - CORS
// von chi ap dung cho request tu trinh duyet. Nguon la da bi chan o middleware tren.
app.use(cors({ origin: true }));
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

// Lay so Kiosk khong con hoi ho ten nen khong co gi ngan mot nguoi (hoac script) rut lien tuc
// nhieu STT ao lam day hang doi. Gioi han theo IP: toi da 30 STT / 10 phut - du cho 1 may Kiosk
// dung chung 1 IP dong nguoi, nhung du chan spam. Khi trien khai that nen chi cho phep IP cua
// may Kiosk goi API nay (xem docs/KIEN-NGHI-LAY-SO-KHONG-NHAP-TEN.md).
const ticketLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ban lay so qua nhieu lan trong thoi gian ngan, vui long cho it phut hoac nho nhan vien ho tro.' }
});
app.post('/api/kiosk/tickets', ticketLimiter);

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

// 404 tuy chinh: API tra JSON (client goi fetch mong doi JSON), trang tinh tra ve trang 404
// than thien thay vi thong bao loi mac dinh cua Express/trinh duyet.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Khong tim thay endpoint.' });
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

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
      console.log(`  - Kiosk:   http://localhost:${PORT}/  (chon thu tuc -> kiosk-checklist.html)`);
      console.log(`  - Counter: http://localhost:${PORT}/counter.html`);
      console.log(`  - Display: http://localhost:${PORT}/display.html`);
      console.log(`  - Admin:   http://localhost:${PORT}/admin.html`);
    });
  })
  .catch((err) => {
    console.error('Khong the khoi dong server (loi migrate/nap cau hinh he thong tu DB):', err);
    process.exit(1);
  });
