let currentService = null;

function showScreen(name) {
  ['home', 'checklist', 'ticket'].forEach((s) => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
}
function goHome() {
  currentService = null;
  document.getElementById('searchInput').value = '';
  document.getElementById('serviceList').innerHTML = '';
  showScreen('home');
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// ---- Tim kiem thu tuc (RAG rut gon: tim theo tu khoa ten/short_alias) ----
async function searchServices() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
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
    <div class="service-item" onclick="selectService(${s.id})">
      <div>
        <div style="font-weight:700;">${s.name}</div>
        <div class="text-muted" style="font-size:0.85rem;">${s.field_name} • SLA ${s.sla_minutes} phút • Lệ phí ${Number(s.fee_amount).toLocaleString('vi-VN')}đ</div>
      </div>
      <span>›</span>
    </div>
  `).join('');
}

async function selectService(serviceId) {
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
    document.getElementById('checklistResult').innerHTML = '';
    showScreen('checklist');
  } catch (err) { showToast(err.message, 'error'); }
}

async function submitCheckGate() {
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

// ---- Wi-Fi QR ----
async function openWifiModal() {
  try {
    const info = await ApiClient.get('/api/kiosk/wifi-qr');
    document.getElementById('wifiInfo').innerHTML = `Tên mạng (SSID): <b>${info.ssid}</b><br/>Mật khẩu: <b>${info.password}</b>`;
    openModal('wifiModal');
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- DVC / VNeID ----
function openDvcModal() { document.getElementById('dvcResult').innerHTML = ''; openModal('dvcModal'); }
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
function openReentryModal() { openModal('reentryModal'); }
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
})();

document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchServices(); });
