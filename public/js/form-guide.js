// Trang Huong dan dien giay to. Doc ?serviceId=<id> tren URL:
//  - co serviceId -> hien huong dan dien to khai cua thu tuc do (GET /api/kiosk/services/:id/form-guide)
//  - khong co     -> hien danh sach cac to khai co huong dan de nguoi dan chon (GET /api/kiosk/form-guides)
// Moi noi dung tu DB deu duoc escape truoc khi chen vao innerHTML.

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function show(id) {
  ['screen-list', 'screen-guide', 'errorBox'].forEach((s) => document.getElementById(s).classList.toggle('hidden', s !== id));
}

function showError(message) {
  const box = document.getElementById('errorBox');
  box.innerHTML = `<p>${esc(message)}</p><a class="btn btn-primary mt-16" href="index.html" style="display:inline-block;">Về Trang chủ</a>`;
  show('errorBox');
}

// Kiosk dat noi cong cong: roi di giua chung thi ve Trang chu de nguoi ke tiep khong thay man hinh cu.
const IDLE_RESET_MS = 3 * 60 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { window.location.href = 'index.html'; }, IDLE_RESET_MS);
}
['click', 'touchstart', 'keydown', 'scroll'].forEach((evt) => document.addEventListener(evt, resetIdleTimer, { passive: true }));
resetIdleTimer();

function renderGeneralRules(rules) {
  document.getElementById('generalRules').innerHTML = (rules || []).map((r) => `
    <div class="rule-item">
      <div class="rule-icon">${esc(r.icon)}</div>
      <div><b>${esc(r.title)}</b><p>${esc(r.text)}</p></div>
    </div>`).join('');
}

// ----- Danh sach to khai -----
async function loadList() {
  try {
    const data = await ApiClient.get('/api/kiosk/form-guides');
    document.getElementById('formList').innerHTML = data.forms.length
      ? data.forms.map((f) => `
        <a class="card-link category-card" href="huong-dan-dien-mau.html?serviceId=${encodeURIComponent(f.service_id)}">
          <div class="card">
            <h3>${esc(f.form_name)}</h3>
            <p class="desc">Thủ tục: ${esc(f.service_name)}</p>
            <div class="meta">Xem cách điền →</div>
          </div>
        </a>`).join('')
      : '<div class="empty-state">Chưa có tờ khai nào có hướng dẫn. Vui lòng hỏi cán bộ hỗ trợ.</div>';
    show('screen-list');
  } catch (err) { showError(err.message); }
}

// ----- Huong dan 1 to khai -----
function updateProgress() {
  const boxes = document.querySelectorAll('#fieldList input[type=checkbox]');
  const done = Array.from(boxes).filter((b) => b.checked).length;
  document.getElementById('progressFill').style.width = `${boxes.length ? (done / boxes.length) * 100 : 0}%`;
  document.getElementById('progressText').textContent = `Đã điền ${done}/${boxes.length} ô`;
  boxes.forEach((b) => b.closest('.field-item').classList.toggle('done', b.checked));
}

function renderGuide(data, serviceId) {
  const { service, form, guide } = data;
  document.title = `Cách điền: ${form.form_name} - Một Cửa Thông Minh`;
  document.getElementById('guideService').textContent = `Thủ tục: ${service.name}`;
  document.getElementById('guideTitle').textContent = form.form_name;
  document.getElementById('guideIntro').textContent = guide.intro || '';
  document.getElementById('guideLocation').innerHTML =
    `📍 <b>Lấy phôi tờ khai tại:</b> ${esc(form.shelf_name)} → ${esc(form.tray_number)} → ${esc(form.desk_area)}`;

  document.getElementById('fieldList').innerHTML = (guide.fields || []).map((f, i) => `
    <li class="field-item">
      <label class="field-check no-print"><input type="checkbox" aria-label="Đã điền ô ${i + 1}" /></label>
      <div class="field-num">${i + 1}</div>
      <div class="field-body">
        <div class="field-label">${esc(f.label)}</div>
        <div class="field-how">${esc(f.how)}</div>
        ${f.example ? `<div class="field-example"><span>Ví dụ</span> ${esc(f.example)}</div>` : ''}
      </div>
    </li>`).join('');
  document.getElementById('fieldList').addEventListener('change', updateProgress);
  updateProgress();

  const hints = data.docHints || [];
  document.getElementById('docHintsCard').classList.toggle('hidden', hints.length === 0);
  document.getElementById('docHints').innerHTML = hints.map((h) => `<li><b>${esc(h.name)}</b><br/>${esc(h.hint)}</li>`).join('');

  document.getElementById('mistakes').innerHTML = (guide.mistakes || []).map((m) => `<li>${esc(m)}</li>`).join('');
  document.getElementById('afterSteps').innerHTML = (guide.after || []).map((m) => `<li>${esc(m)}</li>`).join('');
  renderGeneralRules(data.generalRules);

  document.getElementById('ticketLink').href = `kiosk-checklist.html?serviceId=${encodeURIComponent(serviceId)}`;
  document.getElementById('backLink').href = `kiosk-checklist.html?serviceId=${encodeURIComponent(serviceId)}`;
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  show('screen-guide');
}

async function loadGuide(serviceId) {
  try {
    renderGuide(await ApiClient.get(`/api/kiosk/services/${encodeURIComponent(serviceId)}/form-guide`), serviceId);
  } catch (err) { showError(err.message); }
}

(function init() {
  const serviceId = new URLSearchParams(window.location.search).get('serviceId');
  if (serviceId) loadGuide(serviceId); else loadList();
})();
