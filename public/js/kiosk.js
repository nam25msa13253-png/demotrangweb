let currentService = null;

// Phan hoi rung nhe khi cham nut tren man hinh cam ung (khong co gi xay ra tren thiet bi
// khong ho tro rung - navigator.vibrate don gian khong ton tai/khong lam gi).
function tapFeedback() {
  if (navigator.vibrate) navigator.vibrate(12);
}

const STEP_ORDER = ['home', 'checklist', 'ticket'];
function updateStepper(name) {
  const currentIndex = STEP_ORDER.indexOf(name);
  document.querySelectorAll('.kiosk-step').forEach((el) => {
    const idx = STEP_ORDER.indexOf(el.dataset.step);
    el.classList.toggle('active', idx === currentIndex);
    el.classList.toggle('done', idx < currentIndex);
  });
  document.getElementById('stepLine1').classList.toggle('done', currentIndex > 0);
  document.getElementById('stepLine2').classList.toggle('done', currentIndex > 1);
}

function showScreen(name) {
  STEP_ORDER.forEach((s) => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  updateStepper(name);
}
function goHome() {
  currentService = null;
  document.getElementById('searchInput').value = '';
  document.getElementById('serviceList').innerHTML = '';
  showScreen('home');
}
function closeAllModals() {
  ['wifiModal', 'dvcModal', 'reentryModal', 'formTemplateModal'].forEach(closeModal);
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// Kiosk dat noi cong cong: neu cong dan roi di giua chung ma khong bam "Hoan tat"/"Quay lai",
// tu dong dua ve man hinh chu sau 1 thoi gian khong thao tac de bao ve rieng tu (nguoi ke tiep
// khong nhin thay ho so/STT cua nguoi truoc con dang mo tren man hinh).
const IDLE_RESET_MS = 90 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const homeVisible = !document.getElementById('screen-home').classList.contains('hidden');
    if (!homeVisible) { closeAllModals(); goHome(); }
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
      onclick="selectService(${s.id})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectService(${s.id})}">
      <div>
        <div style="font-weight:700;">${s.name}</div>
        <div class="text-muted" style="font-size:0.85rem;">${s.field_name} • SLA ${s.sla_minutes} phút • Lệ phí ${Number(s.fee_amount).toLocaleString('vi-VN')}đ</div>
      </div>
      <span>›</span>
    </div>
  `).join('');
}

async function selectService(serviceId) {
  tapFeedback();
  try {
    const data = await ApiClient.get(`/api/kiosk/services/${serviceId}/checklist`);
    currentService = data;
    document.getElementById('checklistServiceName').textContent = data.service.name;
    document.getElementById('checklistItems').innerHTML = (data.requiredDocs || []).map((d) => `
      <label class="checklist-item">
        <input type="checkbox" value="${d.code}" />
        <span>${d.name}${d.mandatory ? ' <b style="color:var(--color-danger)">*</b>' : ''}</span>
      </label>
    `).join('');
    renderChecklistStatus();
    showScreen('checklist');
  } catch (err) { showToast(err.message, 'error'); }
}

// Phan hoi truc quan theo thoi gian thuc khi cong dan tich chon giay to: con thieu -> banner
// do; da du 100% giay to bat buoc -> banner xanh. Giup nguoi dan biet ngay minh con thieu gi
// truoc khi bam "Xac nhan" thay vi phai doi server tra loi REJECTED.
function renderChecklistStatus() {
  const box = document.getElementById('checklistResult');
  if (!currentService) { box.innerHTML = ''; return; }

  const mandatoryDocs = (currentService.requiredDocs || []).filter((d) => d.mandatory);
  const checkedCodes = new Set(Array.from(document.querySelectorAll('#checklistItems input:checked')).map((el) => el.value));
  const missingDocs = mandatoryDocs.filter((d) => !checkedCodes.has(d.code));

  if (missingDocs.length > 0) {
    box.innerHTML = `
      <div class="checklist-status checklist-status-missing">
        <span class="icon">⚠️</span>
        <div>
          <div>Còn thiếu ${missingDocs.length} giấy tờ bắt buộc</div>
          <div class="sub">${missingDocs.map((d) => d.name).join(', ')}</div>
        </div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="checklist-status checklist-status-ok">
        <span class="icon">✅</span>
        <div>Đã đủ giấy tờ bắt buộc — sẵn sàng lấy số thứ tự!</div>
      </div>`;
  }
}

document.getElementById('checklistItems').addEventListener('change', renderChecklistStatus);

async function submitCheckGate() {
  tapFeedback();
  const confirmedDocCodes = Array.from(document.querySelectorAll('#checklistItems input:checked')).map((el) => el.value);

  try {
    const result = await ApiClient.post('/api/kiosk/tickets', {
      serviceId: currentService.service.id, citizenName: 'Khách tại Kiosk', phone: '', confirmedDocCodes
    });

    if (result.status === 'REJECTED') {
      showMissingDocsGuide(result);
      return;
    }

    document.getElementById('ticketNumber').textContent = result.ticket.ticket_number;
    document.getElementById('ticketCounterName').textContent = `Vui lòng đến ${result.counter.name}`;
    showScreen('ticket');
  } catch (err) { showToast(err.message, 'error'); }
}

function showMissingDocsGuide(result) {
  const allDocs = currentService.requiredDocs || [];
  const missingNames = (result.missing || []).map((code) => {
    const doc = allDocs.find((d) => d.code === code);
    return doc ? doc.name : code;
  });

  document.getElementById('missingDocsBox').innerHTML = `
    <div class="missing-list">
      <b>Bạn còn thiếu ${missingNames.length} giấy tờ:</b>
      <ul>${missingNames.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>`;

  const form = result.formTemplate;
  if (form) {
    document.getElementById('formLocationBox').innerHTML = `
      <div class="location-box">
        <b>📍 Vị trí lấy phôi tờ khai:</b> ${form.shelf_name} → ${form.tray_number} → ${form.desk_area}<br/>
        ${form.annotated_sample_url ? `<img src="${form.annotated_sample_url}" alt="Mẫu tờ khai" style="max-width:100%;border-radius:8px;margin-top:10px;" onerror="this.style.display='none'"/>` : ''}
        <div class="mt-16"><b>Mã tờ khai:</b> ${form.form_name}</div>
      </div>`;
  } else {
    document.getElementById('formLocationBox').innerHTML = '<p class="text-muted">Vui lòng liên hệ quầy hỗ trợ để được hướng dẫn.</p>';
  }
  openModal('formTemplateModal');
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
// ?serviceId=<id> (nhay thang vao checklist khi den tu Trang chu / the danh muc).
(function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reentry');
  if (token) {
    ApiClient.post('/api/kiosk/reentry-scan', { token })
      .then((result) => showToast(`Đã chèn STT ${result.ticket.ticket_number} trở lại hàng đợi ưu tiên.`, 'success'))
      .catch((err) => showToast(err.message, 'error'));
  }

  const serviceId = params.get('serviceId');
  if (serviceId) selectService(Number(serviceId));
  else updateStepper('home'); // khong co serviceId tren URL -> dang o man hinh chu, danh dau Buoc 1
})();

document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchServices(); });
