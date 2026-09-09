// Trang Doi chieu giay to / Nhan so thu tu cua Kiosk. Doc serviceId tu query string
// ?serviceId=<id> khi vao trang (den tu the danh muc/goi y tim kiem tren index.html - trang
// "Tim thu tuc" rieng da bi bo vi trung lap voi tim kiem san co tren Trang chu).
let currentService = null;

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
  ['checklist', 'ticket'].forEach((s) => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  updateStepper(name);
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
    document.getElementById('checklistItems').innerHTML = (data.requiredDocs || []).map((d) => `
      <label class="checklist-item">
        <input type="checkbox" value="${d.code}" />
        <span>${d.name}${d.mandatory ? ' <b style="color:var(--color-danger)">*</b>' : ''}</span>
      </label>
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
