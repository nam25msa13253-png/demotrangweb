// Trang Buoc 1 (Tim thu tuc) cua Kiosk - da tach rieng khoi Buoc 2/3 (xem kiosk-checklist.html
// + js/kiosk-checklist.js). Chon xong 1 thu tuc se DIEU HUONG SANG TRANG KHAC (khong con
// showScreen() trong cung 1 trang nhu truoc).

// Phan hoi rung nhe khi cham nut tren man hinh cam ung (khong co gi xay ra tren thiet bi
// khong ho tro rung - navigator.vibrate don gian khong ton tai/khong lam gi).
function tapFeedback() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function closeAllModals() {
  ['wifiModal', 'dvcModal', 'reentryModal'].forEach(closeModal);
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// Kiosk dat noi cong cong: neu cong dan roi di ma khong thao tac, xoa o tim kiem/ket qua sau
// 1 thoi gian de bao ve rieng tu (khong co du lieu nhay cam o trang nay nen chi can lam sach
// o tim kiem, khong can dieu huong trang).
const IDLE_RESET_MS = 90 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    closeAllModals();
    document.getElementById('searchInput').value = '';
    document.getElementById('serviceList').innerHTML = '';
  }, IDLE_RESET_MS);
}
['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, resetIdleTimer, { passive: true }));
resetIdleTimer();

function renderServiceListSkeleton() {
  document.getElementById('serviceList').innerHTML = Array.from({ length: 3 })
    .map(() => '<div class="skeleton-card"></div>').join('');
}

// ---- Tim kiem thu tuc (RAG rut gon: tim theo tu khoa ten/short_alias) ----
async function searchServices() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  tapFeedback();
  renderServiceListSkeleton();
  try {
    const services = await ApiClient.get(`/api/kiosk/services?q=${encodeURIComponent(q)}`);
    renderServiceList(services);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderServiceList(services) {
  const list = document.getElementById('serviceList');
  if (services.length === 0) {
    list.innerHTML = '<p class="text-muted text-center">Không tìm thấy thủ tục phù hợp. Vui lòng liên hệ quầy hỗ trợ.</p>';
    return;
  }
  list.innerHTML = services.map((s) => `
    <div class="service-item" tabindex="0" role="button" aria-label="Chọn thủ tục ${s.name}"
      onclick="goToChecklist(${s.id})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();goToChecklist(${s.id})}">
      <div>
        <div style="font-weight:700;">${s.name}</div>
        <div class="text-muted" style="font-size:0.85rem;">${s.field_name} • SLA ${s.sla_minutes} phút • Lệ phí ${Number(s.fee_amount).toLocaleString('vi-VN')}đ</div>
      </div>
      <span>›</span>
    </div>
  `).join('');
}

// Chuyen sang trang Buoc 2 (Doi chieu giay to) mang theo serviceId qua query string.
function goToChecklist(serviceId) {
  tapFeedback();
  window.location.href = `kiosk-checklist.html?serviceId=${serviceId}`;
}

// Mo them bang chat AI voi 1 cau hoi huong dan dinh san, song song voi modal chuc nang that
// (khong thay the) - dung cho 3 nut Thao tac nhanh o man hinh chu Kiosk.
function askChatbotGuide(question) {
  if (window.ChatbotWidget) window.ChatbotWidget.ask(question);
}

// ---- Wi-Fi QR ----
async function openWifiModal() {
  askChatbotGuide('Hướng dẫn tôi kết nối Wi-Fi miễn phí tại đây.');
  try {
    const info = await ApiClient.get('/api/kiosk/wifi-qr');
    document.getElementById('wifiInfo').innerHTML = `Tên mạng (SSID): <b>${info.ssid}</b><br/>Mật khẩu: <b>${info.password}</b>`;
    openModal('wifiModal');
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- DVC / VNeID ----
function openDvcModal() {
  askChatbotGuide('Hướng dẫn tôi cách nộp hồ sơ trực tuyến qua Dịch vụ công (DVC).');
  document.getElementById('dvcResult').innerHTML = '';
  openModal('dvcModal');
}
async function checkVneid() {
  const level = document.getElementById('vneidLevel').value;
  try {
    const result = await ApiClient.post('/api/kiosk/dvc/check-vneid', { vneidLevel: level });
    if (result.eligible) {
      document.getElementById('dvcResult').innerHTML = `
        <div class="location-box">
          <b>✅ Đủ điều kiện nộp trực tuyến!</b>
          <ol>${result.guideSteps.map((s) => `<li>${s}</li>`).join('')}</ol>
        </div>`;
    } else {
      document.getElementById('dvcResult').innerHTML = `<div class="missing-list">${result.message}</div>`;
    }
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- Re-entry QR ----
function openReentryModal() {
  askChatbotGuide('Hướng dẫn tôi cách quét mã QR để bổ sung hồ sơ còn thiếu.');
  openModal('reentryModal');
}
async function submitReentry() {
  const token = document.getElementById('reentryTokenInput').value.trim();
  if (!token) return showToast('Vui lòng nhập mã Re-entry.', 'error');
  try {
    const result = await ApiClient.post('/api/kiosk/reentry-scan', { token });
    showToast(`Đã chèn STT ${result.ticket.ticket_number} trở lại hàng đợi ưu tiên.`, 'success');
    closeModal('reentryModal');
  } catch (err) { showToast(err.message, 'error'); }
}

// Auto-xu ly khi mo bang URL ?reentry=<token> (mo phong quet QR that) hoac
// ?serviceId=<id> (chuyen thang sang trang checklist khi den tu Trang chu / the danh muc).
(function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reentry');
  if (token) {
    ApiClient.post('/api/kiosk/reentry-scan', { token })
      .then((result) => showToast(`Đã chèn STT ${result.ticket.ticket_number} trở lại hàng đợi ưu tiên.`, 'success'))
      .catch((err) => showToast(err.message, 'error'));
  }

  const serviceId = params.get('serviceId');
  if (serviceId) window.location.replace(`kiosk-checklist.html?serviceId=${serviceId}`);
})();

document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchServices(); });
