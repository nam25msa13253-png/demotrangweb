const staff = ApiClient.getStaff();
if (!staff || !ApiClient.getToken()) window.location.href = 'login.html';

let myCounter = null;
let allCounters = [];
let activeTicket = null;
let countdownTimer = null;
let undoTimer = null;

document.getElementById('staffName').textContent = `${staff.fullName} (${staff.role})`;

function logout() {
  ApiClient.post('/api/auth/logout', {}).finally(() => { ApiClient.clearSession(); window.location.href = 'login.html'; });
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

async function init() {
  try {
    allCounters = await ApiClient.get('/api/counters');
  } catch (err) { return showToast(err.message, 'error'); }

  if (staff.role === 'SUPER_ADMIN') {
    const wrap = document.getElementById('counterSelectWrap');
    wrap.innerHTML = `<select id="counterSelect" style="width:auto;"></select>`;
    const select = document.getElementById('counterSelect');
    select.innerHTML = allCounters.map((c) => `<option value="${c.id}">${c.code} - ${c.name}</option>`).join('');
    select.addEventListener('change', () => { setCounter(Number(select.value)); });
    setCounter(Number(select.value));
  } else {
    const own = allCounters.find((c) => c.officer_id === staff.staffId);
    if (!own) {
      document.querySelector('.container').innerHTML = '<div class="card text-center">Bạn chưa được phân công phụ trách quầy nào. Vui lòng liên hệ Admin.</div>';
      return;
    }
    setCounter(own.id);
  }

  const ws = createWsClient();
  ws.on('*', (payload) => {
    const relatedCounterId = payload && (payload.counterId || (payload.ticket && payload.ticket.counter_id) || (payload.counter && payload.counter.id));
    if (myCounter && (relatedCounterId === myCounter.id || relatedCounterId === undefined)) {
      refresh();
    }
  });
}

function setCounter(counterId) {
  myCounter = allCounters.find((c) => c.id === counterId);
  refresh();
}

async function refresh() {
  if (!myCounter) return;
  try {
    allCounters = await ApiClient.get('/api/counters');
    myCounter = allCounters.find((c) => c.id === myCounter.id) || myCounter;
    const queue = await ApiClient.get(`/api/counters/${myCounter.id}/queue`);
    renderQueue(queue);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderQueue(queue) {
  activeTicket = queue.find((t) => t.status === 'CALLING' || t.status === 'PROCESSING') || null;
  const waiting = queue.filter((t) => t.status === 'QUEUED');

  document.getElementById('queueCount').textContent = `${waiting.length} vé đang chờ`;
  document.getElementById('conveyorList').innerHTML = waiting.length === 0
    ? '<div class="empty-state">Hàng đợi trống</div>'
    : waiting.map((t, i) => `
        <div class="conveyor-item ${t.is_priority ? 'priority' : ''}">
          <span><b>${t.ticket_number}</b> ${t.citizen_name}</span>
          <span class="badge ${t.is_priority ? 'badge-yellow' : 'badge-gray'}">${i === 0 ? 'Kế tiếp' : `#${i + 1}`}</span>
        </div>
      `).join('');

  renderActiveSlot();
}

function clearTimers() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  if (undoTimer) { clearInterval(undoTimer); undoTimer = null; }
}

function renderActiveSlot() {
  clearTimers();
  const box = document.getElementById('activeSlotBox');
  const actions = document.getElementById('actionRow');

  if (!activeTicket) {
    box.innerHTML = '<p class="text-muted">Chưa có vé đang xử lý</p>';
    const canCall = myCounter.status === 'OPEN';
    actions.innerHTML = `<button class="btn btn-primary btn-lg btn-block" ${canCall ? '' : 'disabled'} onclick="callNext()">📢 Gọi số tiếp theo</button>`;
    return;
  }

  if (activeTicket.status === 'CALLING') {
    box.innerHTML = `
      <div class="num">${activeTicket.ticket_number}</div>
      <div>${activeTicket.citizen_name}</div>
      <div class="timer mt-16" id="countdownDisplay">45s</div>`;
    actions.innerHTML = `
      <button class="btn btn-success" onclick="acceptTicket()">✅ Tiếp nhận</button>
      <button class="btn btn-danger" onclick="markNoShow()">🚫 Vắng mặt</button>`;
    startCountdown();
    return;
  }

  if (activeTicket.status === 'PROCESSING') {
    box.innerHTML = `
      <div class="num">${activeTicket.ticket_number}</div>
      <div>${activeTicket.citizen_name}</div>
      <span class="badge badge-blue mt-16">Đang xử lý</span>`;
    actions.innerHTML = `
      <button class="btn btn-success" onclick="completeTicket()">✔️ Hoàn tất</button>
      <button class="btn btn-warning" onclick="openSupplementModal()">📝 Yêu cầu Bổ sung</button>`;
  }
}

let countdownDeadline = null;
function startCountdown() {
  countdownDeadline = Date.now() + 45000; // hien thi tam thoi; server la nguon su that cho Timeout
  countdownTimer = setInterval(() => {
    const remain = Math.max(0, Math.round((countdownDeadline - Date.now()) / 1000));
    const el = document.getElementById('countdownDisplay');
    if (el) el.textContent = `${remain}s`;
    if (remain <= 0) clearInterval(countdownTimer);
  }, 1000);
}

async function callNext() {
  try {
    const result = await ApiClient.post(`/api/counters/${myCounter.id}/call-next`, {});
    if (!result || !result.ticket) showToast('Hàng đợi trống.', 'error');
    refresh();
  } catch (err) { showToast(err.message, 'error'); }
}
async function acceptTicket() {
  try { await ApiClient.post(`/api/tickets/${activeTicket.id}/accept`, {}); refresh(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function markNoShow() {
  try { await ApiClient.post(`/api/tickets/${activeTicket.id}/no-show`, {}); refresh(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function completeTicket() {
  try {
    const result = await ApiClient.post(`/api/tickets/${activeTicket.id}/complete`, {});
    showUndoBar(result.ticket, result.undoBufferSeconds || 5);
  } catch (err) { showToast(err.message, 'error'); }
}
function showUndoBar(ticket, seconds) {
  const box = document.getElementById('activeSlotBox');
  const actions = document.getElementById('actionRow');
  let remain = seconds;
  box.innerHTML = `<div class="num">${ticket.ticket_number}</div><span class="badge badge-green">Đã hoàn tất</span>`;
  actions.innerHTML = `<button class="btn btn-outline btn-block" id="undoBtn" onclick="undoComplete('${ticket.id}')">↩️ Hoàn tác (<span id="undoCountdown">${remain}</span>s)</button>`;
  undoTimer = setInterval(() => {
    remain -= 1;
    const el = document.getElementById('undoCountdown');
    if (el) el.textContent = remain;
    if (remain <= 0) { clearInterval(undoTimer); refresh(); }
  }, 1000);
}
async function undoComplete(ticketId) {
  try { await ApiClient.post(`/api/tickets/${ticketId}/undo`, {}); clearTimers(); refresh(); }
  catch (err) { showToast(err.message, 'error'); }
}

// ---- Yeu cau Bo sung ----
async function openSupplementModal() {
  try {
    const data = await ApiClient.get(`/api/kiosk/services/${activeTicket.service_id}/checklist`);
    document.getElementById('supplementChecklist').innerHTML = (data.requiredDocs || []).map((d) => `
      <label class="checklist-item">
        <input type="checkbox" value="${d.code}" />
        <span>${d.name}</span>
      </label>`).join('');
    openModal('supplementModal');
  } catch (err) { showToast(err.message, 'error'); }
}
async function submitSupplement() {
  const missingDocCodes = Array.from(document.querySelectorAll('#supplementChecklist input:checked')).map((el) => el.value);
  if (missingDocCodes.length === 0) return showToast('Vui lòng chọn ít nhất 1 giấy tờ còn thiếu.', 'error');
  try {
    await ApiClient.post(`/api/tickets/${activeTicket.id}/supplement`, { missingDocCodes });
    closeModal('supplementModal');
    refresh();
  } catch (err) { showToast(err.message, 'error'); }
}

init();
