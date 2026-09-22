// Trang Doi chieu giay to / Nhan so thu tu cua Kiosk. Doc serviceId tu query string
// ?serviceId=<id> khi vao trang (den tu the danh muc/goi y tim kiem tren index.html - trang
// "Tim thu tuc" rieng da bi bo vi trung lap voi tim kiem san co tren Trang chu).
let currentService = null;

// Noi dung dong tu DB (ten giay to, goi y...) chen vao innerHTML - escape de an toan.
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function guideUrl(serviceId) {
  return `huong-dan-dien-mau.html?serviceId=${encodeURIComponent(serviceId)}`;
}

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
  ['checklist', 'ticket', 'closed'].forEach((s) => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  updateStepper(name === 'closed' ? 'checklist' : name); // man hinh dong cua van thuoc buoc 2
}

// Khong con trang "Tim thu tuc" rieng nua - quay lai nghia la ve Trang chu (index.html), noi
// da co san o tim kiem/the danh muc dan thang toi trang nay.
function goBackToSearch() {
  window.location.href = 'index.html';
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// Kiosk dat noi cong cong: neu cong dan roi di giua chung ma khong bam "Hoan tat"/"Quay lai",
// tu dong ve han trang Buoc 1 sau 1 thoi gian khong thao tac de bao ve rieng tu (nguoi ke tiep
// khong nhin thay ho so/STT cua nguoi truoc con dang mo tren man hinh).
const IDLE_RESET_MS = 90 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { closeModal('formTemplateModal'); goBackToSearch(); }, IDLE_RESET_MS);
}
['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, resetIdleTimer, { passive: true }));
resetIdleTimer();

async function loadChecklist(serviceId) {
  tapFeedback();
  try {
    const data = await ApiClient.get(`/api/kiosk/services/${serviceId}/checklist`);
    currentService = data;
    document.getElementById('checklistServiceName').textContent = data.service.name;
    // Moi giay to: o tich chon + goi y "cach co giay nay/can mang gi" + nut xem cach dien neu la to khai.
    document.getElementById('checklistItems').innerHTML = (data.requiredDocs || []).map((d) => `
      <div class="checklist-row">
        <label class="checklist-item">
          <input type="checkbox" value="${esc(d.code)}" />
          <span>${esc(d.name)}${d.mandatory ? ' <b style="color:var(--color-danger)">*</b>' : ''}</span>
        </label>
        ${d.hint ? `<div class="doc-hint">💡 ${esc(d.hint)}</div>` : ''}
        ${d.hasFillGuide ? `<a class="btn btn-outline doc-guide-btn" href="${guideUrl(data.service.id)}">📝 Xem cách điền tờ khai này</a>` : ''}
      </div>
    `).join('');
    renderChecklistStatus();
    showScreen('checklist');
  } catch (err) {
    showToast(err.message, 'error');
  }
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
    // Khong hoi ho ten/SDT: so thu tu la dinh danh duy nhat (xem docs/KIEN-NGHI-LAY-SO-KHONG-NHAP-TEN.md).
    const result = await ApiClient.post('/api/kiosk/tickets', {
      serviceId: currentService.service.id, confirmedDocCodes
    });

    if (result.status === 'REJECTED') {
      showMissingDocsGuide(result);
      return;
    }

    if (result.status === 'CLOSED') {
      showClosedScreen(result);
      return;
    }

    document.getElementById('ticketNumber').textContent = result.ticket.ticket_number;
    document.getElementById('ticketCounterName').textContent = `Vui lòng đến ${result.counter.name}`;
    showScreen('ticket');
    renderTicketExtras(result.ticket.id);
  } catch (err) { showToast(err.message, 'error'); }
}

// Ngoai gio lam viec: thong bao ro rang (kem gio mo cua ke tiep) thay vi chi bao loi.
function showClosedScreen(info) {
  document.getElementById('closedMessage').textContent = info.message || 'Trung tâm hiện đang đóng cửa.';
  document.getElementById('closedOpensAt').textContent = info.opensAt
    ? `Mở cửa lại: ${info.opensAt.weekday}, ${info.opensAt.date} lúc ${info.opensAt.time}` : '';
  const guideBtn = document.getElementById('closedGuideBtn');
  guideBtn.classList.toggle('hidden', !(currentService && currentService.hasFillGuide));
  if (currentService) guideBtn.href = guideUrl(currentService.service.id);
  showScreen('closed');
}

// Vao trang luc ngoai gio: bao ngay tren nut, khong bat nguoi dan tich xong roi moi biet.
window.addEventListener('load', () => {
  if (!window.KioskHours) return;
  window.KioskHours.load().then((hours) => {
    if (!hours || hours.open) return;
    const btn = document.querySelector('[data-action=submitCheckGate]');
    if (btn) { btn.textContent = 'Ngoài giờ làm việc — xem thông báo'; }
  });
});

// Thu vien QR (qrcodejs, cdnjs da duoc CSP cho phep) - tai 1 lan khi can.
let qrLibPromise = null;
function loadQrLibrary() {
  if (window.QRCode) return Promise.resolve();
  if (!qrLibPromise) {
    qrLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Khong tai duoc thu vien QR'));
      document.head.appendChild(script);
    });
  }
  return qrLibPromise;
}

// Phieu STT: nguoi dan chua nhap ten nen can cach "giu" so cua minh - hien so nguoi cho phia
// truoc + thoi gian uoc tinh, va ma QR mo trang theo doi tren dien thoai (khong can ten/SDT).
async function renderTicketExtras(ticketId) {
  const trackUrl = `${window.location.origin}/theo-doi.html?t=${encodeURIComponent(ticketId)}`;
  const waitEl = document.getElementById('ticketWait');
  waitEl.textContent = '';
  document.getElementById('ticketQr').innerHTML = '';
  document.getElementById('ticketTrackLink').href = trackUrl;

  try {
    const info = await ApiClient.get(`/api/kiosk/tickets/${encodeURIComponent(ticketId)}/status`);
    waitEl.textContent = info.aheadCount === 0
      ? 'Bạn là người tiếp theo — vui lòng ở gần quầy.'
      : `Phía trước còn ${info.aheadCount} người • Chờ khoảng ${info.estimatedWaitMinutes} phút (ước tính)`;
  } catch (err) { /* khong chan viec hien so neu khong lay duoc thong tin cho */ }

  try {
    await loadQrLibrary();
    // eslint-disable-next-line no-new
    new window.QRCode(document.getElementById('ticketQr'), { text: trackUrl, width: 150, height: 150 });
  } catch (err) {
    document.getElementById('ticketQr').textContent = ''; // khong co CDN: van con lien ket ben duoi
  }
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
        <b>📍 Vị trí lấy phôi tờ khai:</b> ${esc(form.shelf_name)} → ${esc(form.tray_number)} → ${esc(form.desk_area)}<br/>
        <div class="mt-16"><b>Tờ khai:</b> ${esc(form.form_name)}</div>
      </div>
      ${currentService.hasFillGuide ? `<a class="btn btn-primary btn-block mt-16" href="${guideUrl(currentService.service.id)}">📝 Xem cách điền tờ khai từng bước</a>` : ''}`;
  } else {
    document.getElementById('formLocationBox').innerHTML = '<p class="text-muted">Vui lòng liên hệ quầy hỗ trợ để được hướng dẫn.</p>';
  }
  openModal('formTemplateModal');
}

// Trang nay bat buoc phai co ?serviceId=<id> tren URL (chi den tu the danh muc/goi y tim kiem
// tren Trang chu) - neu thieu, dieu huong ve Trang chu thay vi hien trang trong.
(function initFromUrl() {
  const serviceId = new URLSearchParams(window.location.search).get('serviceId');
  if (!serviceId) {
    window.location.replace('index.html');
    return;
  }
  loadChecklist(Number(serviceId));
})();
